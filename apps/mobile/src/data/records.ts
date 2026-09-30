import {
  ENTITIES,
  daysToMask,
  maskToDays,
  type ColumnType,
  type EntityName,
  type EntityRecordMap,
} from '@journal/shared';
import type { Db, SqlValue } from '../db/types';

/**
 * Generic local storage for synced records. Every local write goes through `writeLocal`,
 * which in one transaction (1) saves the row as `pending` and (2) queues it in the
 * outbox. The UI reads SQLite, so changes appear immediately, online or not.
 */

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'rejected';

export interface Ctx {
  db: Db;
  userId: string;
  now: () => Date;
  uuid: () => string;
  /** Called after every local write so the app can schedule a sync. */
  onWrite?: () => void;
}

type Row = Record<string, SqlValue>;

function fromDb(type: ColumnType, v: SqlValue | undefined): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'bool':
      return Number(v) === 1;
    case 'mask':
      return maskToDays(Number(v));
    case 'number':
      return Number(v);
    default:
      return String(v);
  }
}

function toDb(type: ColumnType, v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'bool':
      return v ? 1 : 0;
    case 'mask':
      return daysToMask(v as number[]);
    case 'number':
      return Number(v);
    default:
      return String(v);
  }
}

export function rowToRecord<E extends EntityName>(entity: E, row: Row): EntityRecordMap[E] {
  const out: Record<string, unknown> = {};
  for (const fd of ENTITIES[entity].fields) out[fd.field] = fromDb(fd.type, row[fd.col]);
  return out as EntityRecordMap[E];
}

export interface LocalRow<E extends EntityName> {
  record: EntityRecordMap[E];
  serverSeq: number | null;
  syncStatus: SyncStatus;
}

const cols = (entity: EntityName) => ENTITIES[entity].fields.map((f) => f.col);

export async function getLocal<E extends EntityName>(db: Db, entity: E, id: string): Promise<LocalRow<E> | undefined> {
  const row = await db.get<Row>(`SELECT * FROM ${ENTITIES[entity].table} WHERE id = ?`, [id]);
  if (!row) return undefined;
  return {
    record: rowToRecord(entity, row),
    serverSeq: row.server_seq === null ? null : Number(row.server_seq),
    syncStatus: row.sync_status as SyncStatus,
  };
}

/** Non-deleted records. `where` uses raw column names; pass values in `params`. */
export async function listLocal<E extends EntityName>(
  db: Db,
  entity: E,
  opts: { where?: string; params?: SqlValue[]; orderBy?: string; includeDeleted?: boolean } = {},
): Promise<EntityRecordMap[E][]> {
  const conds = [opts.includeDeleted ? '1 = 1' : 'deleted_at IS NULL'];
  if (opts.where) conds.push(`(${opts.where})`);
  const rows = await db.all<Row>(
    `SELECT * FROM ${ENTITIES[entity].table} WHERE ${conds.join(' AND ')}${opts.orderBy ? ` ORDER BY ${opts.orderBy}` : ''}`,
    opts.params ?? [],
  );
  return rows.map((r) => rowToRecord(entity, r));
}

async function upsertRow(
  tx: Db,
  entity: EntityName,
  record: Record<string, unknown>,
  extra: { user_id: string; server_seq?: number | null; sync_status: SyncStatus; last_synced_at?: string | null },
  keepServerSeq: boolean,
) {
  const def = ENTITIES[entity];
  const names = [...cols(entity), 'user_id', 'sync_status'];
  const values: SqlValue[] = [...def.fields.map((f) => toDb(f.type, record[f.field])), extra.user_id, extra.sync_status];
  if (!keepServerSeq) {
    names.push('server_seq', 'last_synced_at');
    values.push(extra.server_seq ?? null, extra.last_synced_at ?? null);
  }
  const updates = names.filter((n) => n !== 'id').map((n) => `${n} = excluded.${n}`);
  await tx.run(
    `INSERT INTO ${def.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`,
    values,
  );
}

/** Queues a record for upload. One outbox row per record; re-edits refresh its change id. */
export async function enqueue(tx: Db, ctx: Pick<Ctx, 'uuid' | 'now'>, entity: EntityName, recordId: string) {
  await tx.run(
    `INSERT INTO outbox (change_id, entity, record_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(entity, record_id) DO UPDATE SET change_id = excluded.change_id, attempts = 0, last_error = NULL`,
    [ctx.uuid(), entity, recordId, ctx.now().toISOString()],
  );
}

/**
 * Validates and saves a record locally, marks it pending and queues it for sync — all in
 * one transaction. Throws a ZodError if the record is invalid (nothing is saved).
 * The row's `server_seq` (the version last seen from the server) is left untouched unless
 * `baseSeq` is given (used when resolving conflicts).
 */
export async function writeLocal<E extends EntityName>(
  ctx: Ctx,
  entity: E,
  record: EntityRecordMap[E] | Record<string, unknown>,
  opts: { tx?: Db; baseSeq?: number | null } = {},
): Promise<EntityRecordMap[E]> {
  const parsed = ENTITIES[entity].schema.parse(record) as EntityRecordMap[E];
  const run = async (tx: Db) => {
    const keepSeq = opts.baseSeq === undefined;
    await upsertRow(tx, entity, parsed as Record<string, unknown>, {
      user_id: ctx.userId,
      sync_status: 'pending',
      server_seq: opts.baseSeq ?? null,
    }, keepSeq);
    await enqueue(tx, ctx, entity, parsed.id);
  };
  if (opts.tx) await run(opts.tx);
  else await ctx.db.transaction(run);
  ctx.onWrite?.();
  return parsed;
}

/** Stores a record received from the server as the synced local copy. */
export async function applyServerRecord(
  tx: Db,
  userId: string,
  entity: EntityName,
  record: Record<string, unknown> & { serverSeq: number },
  now: Date,
) {
  await upsertRow(tx, entity, record, {
    user_id: userId,
    sync_status: 'synced',
    server_seq: record.serverSeq,
    last_synced_at: now.toISOString(),
  }, false);
}

export async function getKv(db: Db, key: string): Promise<string | null> {
  const row = await db.get<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setKv(db: Db, key: string, value: string | null): Promise<void> {
  await db.run(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/** Timestamp for a local edit: now, but always after the record's previous updatedAt. */
export function editTime(ctx: Pick<Ctx, 'now'>, previous?: { updatedAt: string }): string {
  const now = ctx.now().getTime();
  const after = previous ? Date.parse(previous.updatedAt) + 1 : 0;
  return new Date(Math.max(now, after)).toISOString();
}
