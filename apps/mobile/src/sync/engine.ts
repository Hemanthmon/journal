import {
  ENTITIES,
  isEntityName,
  type EntityName,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from '@journal/shared';
import { wipeUserData } from '../db/schema';
import type { Db } from '../db/types';
import { applyServerRecord, getKv, getLocal, setKv } from '../data/records';

/**
 * Offline-first sync between the on-device SQLite database and the server.
 *
 *  push: send outbox entries (oldest first) with the version each record was based on.
 *        applied  -> mark synced, remember the new server version
 *        stale    -> the server kept a newer copy; adopt it
 *        conflict -> journal text changed on two devices; keep both copies for the user
 *        rejected -> invalid; stop retrying and flag the record
 *  pull: fetch everything since the stored cursor and apply it, except over records with
 *        unsent local edits (the next push settles those).
 *
 * A change that was edited again while its upload was in flight stays queued (its
 * change id no longer matches), so the newer edit is never lost.
 */

export type TransportErrorKind = 'network' | 'auth' | 'epoch' | 'server';

export class TransportError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export interface SyncTransport {
  push(req: PushRequest): Promise<PushResponse>;
  pull(cursor: number, limit: number): Promise<PullResponse>;
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
  rejected: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  errorKind: TransportErrorKind | null;
}

export interface SyncDeps {
  db: Db;
  userId: string;
  transport: SyncTransport;
  isOnline: () => boolean | Promise<boolean>;
  now?: () => Date;
  onState?: (s: SyncState) => void;
  pushBatchSize?: number;
  pullLimit?: number;
}

interface OutboxRow {
  seq: number;
  change_id: string;
  entity: string;
  record_id: string;
}

const KV_CURSOR = 'cursor';
const KV_EPOCH = 'epoch';
const KV_LAST_SYNCED = 'lastSyncedAt';

export class SyncEngine {
  private state: SyncState = {
    phase: 'idle',
    pending: 0,
    conflicts: 0,
    rejected: 0,
    lastSyncedAt: null,
    lastError: null,
    errorKind: null,
  };
  private running: Promise<SyncState> | null = null;
  private again = false;
  private readonly now: () => Date;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  getState(): SyncState {
    return this.state;
  }

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.deps.onState?.(this.state);
  }

  /** Recounts pending/conflict/rejected records (cheap; call after local writes). */
  async refreshCounts(): Promise<SyncState> {
    const { db } = this.deps;
    const pending = (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0;
    const conflicts = (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conflicts'))?.n ?? 0;
    let rejected = 0;
    for (const e of Object.values(ENTITIES)) {
      rejected +=
        (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${e.table} WHERE sync_status = 'rejected'`))?.n ?? 0;
    }
    const lastSyncedAt = await getKv(db, KV_LAST_SYNCED);
    this.setState({ pending, conflicts, rejected, lastSyncedAt });
    return this.state;
  }

  /**
   * Runs one sync. Concurrent calls share the running sync; a call made during a sync
   * schedules one more pass afterwards (to pick up edits made meanwhile).
   */
  sync(): Promise<SyncState> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.syncOnce();
        } while (this.again && this.state.phase === 'idle');
        return this.state;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async syncOnce(): Promise<void> {
    if (!(await this.deps.isOnline())) {
      await this.refreshCounts();
      this.setState({ phase: 'offline' });
      return;
    }
    this.setState({ phase: 'syncing' });
    try {
      // First sync after sign-in: learn the epoch and existing data before pushing.
      if ((await getKv(this.deps.db, KV_EPOCH)) === null) await this.pullAll();
      await this.pushAll();
      await this.pullAll();
      await setKv(this.deps.db, KV_LAST_SYNCED, this.now().toISOString());
      await this.refreshCounts();
      this.setState({ phase: 'idle', lastError: null, errorKind: null });
    } catch (err) {
      if (err instanceof TransportError && err.kind === 'epoch') {
        // All data was deleted from another device: discard the local copy and re-download.
        await this.resetLocal();
        try {
          await this.pullAll();
          await this.refreshCounts();
          this.setState({ phase: 'idle', lastError: null, errorKind: null });
          return;
        } catch (inner) {
          err = inner;
        }
      }
      await this.refreshCounts();
      const kind = err instanceof TransportError ? err.kind : 'server';
      this.setState({
        phase: kind === 'network' ? 'offline' : 'error',
        errorKind: kind,
        lastError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  private async resetLocal() {
    await wipeUserData(this.deps.db);
    await setKv(this.deps.db, 'owner', this.deps.userId);
  }

  private async pushAll(): Promise<void> {
    const { db, transport } = this.deps;
    const batchSize = this.deps.pushBatchSize ?? 100;
    const epoch = Number(await getKv(db, KV_EPOCH));
    const top = (await db.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM outbox'))?.m ?? 0;
    let after = 0;

    for (;;) {
      const entries = await db.all<OutboxRow>(
        'SELECT seq, change_id, entity, record_id FROM outbox WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?',
        [after, top, batchSize],
      );
      if (entries.length === 0) return;
      after = entries[entries.length - 1]!.seq;

      const changes: PushRequest['changes'] = [];
      const sent: OutboxRow[] = [];
      for (const e of entries) {
        if (!isEntityName(e.entity)) {
          await db.run('DELETE FROM outbox WHERE seq = ?', [e.seq]);
          continue;
        }
        const row = await getLocal(db, e.entity, e.record_id);
        if (!row) {
          await db.run('DELETE FROM outbox WHERE seq = ?', [e.seq]);
          continue;
        }
        changes.push({
          changeId: e.change_id,
          entity: e.entity,
          baseSeq: row.serverSeq,
          record: row.record as unknown as Record<string, unknown>,
        });
        sent.push(e);
      }
      if (changes.length === 0) continue;

      let res: PushResponse;
      try {
        res = await transport.push({ epoch, changes });
      } catch (err) {
        await db.run(
          `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq IN (${sent.map(() => '?').join(',')})`,
          [err instanceof Error ? err.message.slice(0, 200) : 'error', ...sent.map((s) => s.seq)],
        );
        throw err;
      }
      await this.applyPushResults(sent, res);
    }
  }

  private async applyPushResults(sent: OutboxRow[], res: PushResponse) {
    const { db, userId } = this.deps;
    const now = this.now();
    const byChange = new Map(res.results.map((r) => [r.changeId, r]));

    await db.transaction(async (tx) => {
      for (const e of sent) {
        const r = byChange.get(e.change_id);
        if (!r) continue;
        const entity = e.entity as EntityName;
        const table = ENTITIES[entity].table;
        const current = await tx.get<{ change_id: string }>(
          'SELECT change_id FROM outbox WHERE entity = ? AND record_id = ?',
          [entity, e.record_id],
        );
        // Unchanged = not edited again while the upload was in flight.
        const unchanged = current?.change_id === e.change_id;

        if (r.status === 'applied') {
          if (unchanged) {
            await tx.run('DELETE FROM outbox WHERE entity = ? AND record_id = ?', [entity, e.record_id]);
            await tx.run(`UPDATE ${table} SET sync_status = 'synced', server_seq = ?, last_synced_at = ? WHERE id = ?`, [
              r.serverSeq ?? null,
              now.toISOString(),
              e.record_id,
            ]);
          } else {
            await tx.run(`UPDATE ${table} SET server_seq = ? WHERE id = ?`, [r.serverSeq ?? null, e.record_id]);
          }
        } else if (r.status === 'stale') {
          if (unchanged && r.record) {
            await tx.run('DELETE FROM outbox WHERE entity = ? AND record_id = ?', [entity, e.record_id]);
            await applyServerRecord(tx, userId, entity, r.record, now);
          }
        } else if (r.status === 'conflict' && r.record) {
          await tx.run('DELETE FROM outbox WHERE entity = ? AND record_id = ?', [entity, e.record_id]);
          await tx.run(
            `INSERT INTO conflicts (entity, record_id, server_json, detected_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(entity, record_id) DO UPDATE SET server_json = excluded.server_json, detected_at = excluded.detected_at`,
            [entity, e.record_id, JSON.stringify(r.record), now.toISOString()],
          );
          await tx.run(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`, [e.record_id]);
        } else if (r.status === 'rejected') {
          await tx.run('DELETE FROM outbox WHERE entity = ? AND record_id = ?', [entity, e.record_id]);
          await tx.run(`UPDATE ${table} SET sync_status = 'rejected' WHERE id = ?`, [e.record_id]);
        }
      }
    });
  }

  private async pullAll(): Promise<void> {
    const { db, transport, userId } = this.deps;
    const limit = this.deps.pullLimit ?? 500;
    for (;;) {
      const cursor = Number((await getKv(db, KV_CURSOR)) ?? 0);
      const storedEpoch = await getKv(db, KV_EPOCH);
      const res = await transport.pull(cursor, limit);
      if (storedEpoch !== null && Number(storedEpoch) !== res.epoch) {
        throw new TransportError('epoch', 'Data was reset on another device');
      }
      const now = this.now();
      await db.transaction(async (tx) => {
        for (const ch of res.changes) {
          if (!isEntityName(ch.entity)) continue;
          const local = await tx.get<{ sync_status: string }>(
            `SELECT sync_status FROM ${ENTITIES[ch.entity].table} WHERE id = ?`,
            [String(ch.record.id)],
          );
          // Never overwrite unsent local edits or an unresolved conflict.
          if (local && (local.sync_status === 'pending' || local.sync_status === 'conflict')) continue;
          await applyServerRecord(tx, userId, ch.entity, ch.record, now);
        }
        await tx.run(
          `INSERT INTO sync_state (key, value) VALUES (?, ?), (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [KV_CURSOR, String(res.nextCursor), KV_EPOCH, String(res.epoch)],
        );
      });
      if (!res.hasMore) return;
    }
  }
}
