import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import type { AuthResponse, PublicUser } from '@journal/shared';
import { api, setSessionExpiredHandler } from '../api/client';
import { tokens } from '../api/tokens';
import { getKv, setKv, type Ctx } from '../data/records';
import { openDb } from '../db/expoDb';
import { wipeUserData } from '../db/schema';
import type { Db } from '../db/types';
import { cancelReminder } from '../lib/notifications';
import { queryClient, refreshLocalQueries } from '../lib/queryClient';
import { loadPrefs, usePrefs } from './prefs';
import { syncService } from './sync';

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: PublicUser | null;
  /** Refresh token was rejected: keep working offline, ask to sign in to resume sync. */
  needsReauth: boolean;
  db: Db | null;
  ctx: Ctx | null;
  bootstrap(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  setUser(user: PublicUser): Promise<void>;
}

function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export const useSession = create<SessionState>((set, get) => {
  /** Opens the signed-in user's local data. Another user's leftover data is wiped first. */
  async function activate(user: PublicUser) {
    const db = get().db ?? (await openDb());
    const owner = await getKv(db, 'owner');
    if (owner && owner !== user.id) await wipeUserData(db);
    await setKv(db, 'owner', user.id);

    const ctx: Ctx = {
      db,
      userId: user.id,
      now: () => new Date(),
      uuid: () => Crypto.randomUUID(),
      onWrite: () => {
        refreshLocalQueries();
        syncService.afterWrite();
      },
    };
    syncService.start(db, user.id, () => set({ needsReauth: true }));
    set({ status: 'signedIn', user, db, ctx, needsReauth: false });
  }

  async function signedIn(res: AuthResponse) {
    await tokens.save(res.tokens);
    await tokens.saveUser(res.user);
    await activate(res.user);
  }

  setSessionExpiredHandler(() => set({ needsReauth: true }));

  return {
    status: 'loading',
    user: null,
    needsReauth: false,
    db: null,
    ctx: null,

    async bootstrap() {
      const db = await openDb();
      await loadPrefs(db);
      set({ db });
      const { user } = await tokens.load();
      // Works offline: a stored session opens straight into local data.
      if (user && tokens.refresh) await activate(user);
      else set({ status: 'signedOut' });
    },

    async login(email, password) {
      const res = await api.post<{ data: AuthResponse }>('/auth/login', { email, password });
      await signedIn(res.data.data);
    },

    async register(name, email, password) {
      const res = await api.post<{ data: AuthResponse }>('/auth/register', {
        name,
        email,
        password,
        timezone: deviceTimezone(),
      });
      await signedIn(res.data.data);
    },

    /** Signs out and removes this user's data from the device (it remains on the server). */
    async logout() {
      syncService.stop();
      const refreshToken = tokens.refresh;
      if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => undefined);
      const { db } = get();
      if (db) await wipeUserData(db);
      await tokens.clear();
      await cancelReminder();
      await usePrefs.getState().set({ reminderEnabled: false });
      queryClient.clear();
      set({ status: 'signedOut', user: null, ctx: null, needsReauth: false });
    },

    async setUser(user) {
      await tokens.saveUser(user);
      set({ user });
    },
  };
});

/** The repository context for the signed-in user. Only call inside signed-in screens. */
export function useCtx(): Ctx {
  const ctx = useSession((s) => s.ctx);
  if (!ctx) throw new Error('useCtx used while signed out');
  return ctx;
}
