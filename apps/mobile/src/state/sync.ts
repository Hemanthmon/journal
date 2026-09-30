import NetInfo from '@react-native-community/netinfo';
import { AppState, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';
import type { Db } from '../db/types';
import { refreshLocalQueries } from '../lib/queryClient';
import { SyncEngine, type SyncState } from '../sync/engine';
import { apiTransport } from '../sync/apiTransport';

const INITIAL: SyncState = {
  phase: 'idle',
  pending: 0,
  conflicts: 0,
  rejected: 0,
  lastSyncedAt: null,
  lastError: null,
  errorKind: null,
};

export const useSyncStore = create<{ state: SyncState }>(() => ({ state: INITIAL }));

const PERIODIC_MS = 5 * 60 * 1000;
const AFTER_WRITE_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return s.isConnected !== false && s.isInternetReachable !== false;
}

/**
 * Runs sync in the background: shortly after local writes, when the network comes back,
 * when the app returns to the foreground, and every few minutes. Failures retry with
 * exponential backoff. Syncing never blocks the UI — writes always go to SQLite first.
 */
class SyncService {
  private engine: SyncEngine | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private unsubNet: (() => void) | null = null;
  private appState: NativeEventSubscription | null = null;
  private onAuthError: () => void = () => {};

  start(db: Db, userId: string, onAuthError: () => void) {
    this.stop();
    this.onAuthError = onAuthError;
    this.engine = new SyncEngine({
      db,
      userId,
      transport: apiTransport,
      isOnline,
      onState: (state) => useSyncStore.setState({ state }),
    });
    this.unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) this.request(0);
    });
    this.appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') this.request(0);
    });
    this.interval = setInterval(() => this.request(0), PERIODIC_MS);
    void this.engine.refreshCounts();
    this.request(0);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.unsubNet?.();
    this.appState?.remove();
    this.timer = null;
    this.interval = null;
    this.unsubNet = null;
    this.appState = null;
    this.engine = null;
    this.failures = 0;
    useSyncStore.setState({ state: INITIAL });
  }

  /** Schedules a sync after `delayMs` (debounced). */
  request(delayMs = AFTER_WRITE_MS) {
    if (!this.engine) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  /** Called after each local write: update counts now, upload shortly. */
  afterWrite() {
    void this.engine?.refreshCounts();
    this.request();
  }

  async syncNow() {
    this.failures = 0;
    await this.run();
  }

  private async run() {
    const engine = this.engine;
    if (!engine) return;
    const state = await engine.sync();
    refreshLocalQueries();
    if (state.errorKind === 'auth') {
      this.onAuthError();
      return;
    }
    if (state.phase === 'error' || (state.phase === 'offline' && state.pending > 0)) {
      this.failures++;
      const delay = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** (this.failures - 1)) * (0.8 + Math.random() * 0.4);
      this.request(delay);
    } else {
      this.failures = 0;
    }
  }
}

export const syncService = new SyncService();
