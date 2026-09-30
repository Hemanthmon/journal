import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  ENTITIES,
  contentFields,
  daysToMask,
  maskToDays,
  type ColumnType,
  type EntityName,
  type EntityRecordMap,
  type WithSeq,
} from '@journal/shared';
import type { Queryable } from '../db/pool';
import { allocateSeq } from '../db/seq';
import { zodDetails } from '../middleware/validate';

/**
 * The one write path for every synced table. CRUD routes and sync push both go through
 * `applyRecord`, so validation, ownership checks, sequence numbering and conflict rules
 * can't drift apart.
 *
 * Conflict policy
 *   - Identical content: no-op (no new sequence number).
 *   - Sticky deletes (habits, questions, urges): once deleted on the server, stays deleted.
 *   - Journal text answers pushed by a device: optimistic concurrency. If the server's
 *     copy changed since the version the device last saw (baseSeq), nothing is
 *     overwritten and the result is `conflict` so the user can choose.
 *   - Everything else: last write wins on `updatedAt`; ties keep the server's copy.
 */

type Row = RowDataPacket & Record<string, unknown>;
export type ServerRecord<E extends EntityName> = WithSeq<EntityRecordMap[E]>;

/** Device clocks can be wrong; timestamps more than this far in the future are clamped. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const columnList = (entity: EntityName) => ENTITIES[entity].fields.map((f) => f.col).join(', ');

function fromDb(type: ColumnType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'datetime':
      return (v as Date).toISOString();
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

function toDb(type: ColumnType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'datetime':
      return new Date(v as string);
    case 'bool':
      return v ? 1 : 0;
    case 'mask':
      return daysToMask(v as number[]);
    default:
      return v;
  }
}

export function rowToRecord<E extends EntityName>(entity: E, row: Record<string, unknown>): ServerRecord<E> {
  const out: Record<string, unknown> = {};
  for (const fd of ENTITIES[entity].fields) out[fd.field] = fromDb(fd.type, row[fd.col]);
  out.serverSeq = Number(row.server_seq);
  return out as unknown as ServerRecord<E>;
}

/** Finds a user's record by id. Another user's id behaves exactly like a missing one. */
export async function findRecord<E extends EntityName>(
  db: Queryable,
  entity: E,
  userId: string,
  id: string,
  opts: { includeDeleted?: boolean; forUpdate?: boolean } = {},
): Promise<ServerRecord<E> | undefined> {
  const { table } = ENTITIES[entity];
  const [rows] = await db.execute<Row[]>(
    `SELECT server_seq, ${columnList(entity)} FROM ${table}
      WHERE user_id = ? AND id = ?${opts.includeDeleted ? '' : ' AND deleted_at IS NULL'}${opts.forUpdate ? ' FOR UPDATE' : ''}`,
    [userId, id],
  );
  return rows[0] ? rowToRecord(entity, rows[0]) : undefined;
}

/**
 * Lists a user's non-deleted records. `where` is extra SQL using `t.` column aliases;
 * values must go through `params`.
 */
export async function listRecords<E extends EntityName>(
  db: Queryable,
  entity: E,
  userId: string,
  opts: { where?: string; params?: unknown[]; orderBy: string; limit?: number },
): Promise<ServerRecord<E>[]> {
  const { table } = ENTITIES[entity];
  const cols = ENTITIES[entity].fields.map((f) => `t.${f.col}`).join(', ');
  const [rows] = await db.query<Row[]>(
    `SELECT t.server_seq, ${cols} FROM ${table} t
      WHERE t.user_id = ? AND t.deleted_at IS NULL${opts.where ? ` AND ${opts.where}` : ''}
      ORDER BY ${opts.orderBy}${opts.limit ? ` LIMIT ${Number(opts.limit)}` : ''}`,
    [userId, ...(opts.params ?? [])],
  );
  return rows.map((r) => rowToRecord(entity, r));
}

export async function nextDisplayOrder(db: Queryable, entity: 'habits' | 'journalQuestions', userId: string) {
  const [rows] = await db.execute<Row[]>(
    `SELECT COALESCE(MAX(display_order) + 1, 0) AS next FROM ${ENTITIES[entity].table}
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.next ?? 0);
}

export type ApplyOutcome<E extends EntityName = EntityName> =
  | { status: 'applied'; serverSeq: number; changed: boolean }
  | { status: 'stale' | 'conflict'; serverRecord: ServerRecord<E> }
  | {
      status: 'rejected';
      errorCode: 'INVALID' | 'MISSING_PARENT' | 'DUPLICATE' | 'ID_CONFLICT';
      details?: { path: string; message: string }[];
    };

export interface ApplyOptions {
  now: Date;
  /**
   * The server_seq the client last saw for this record. `undefined` means the caller is
   * the server itself (CRUD routes), which skips the concurrent-edit check.
   */
  baseSeq?: number | null;
}

function sameContent(entity: EntityName, a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return contentFields(entity).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/** Maps constraint failures to a push rejection code (anything else is a real error). */
export function constraintErrorCode(err: unknown): 'MISSING_PARENT' | 'DUPLICATE' | 'INVALID' | undefined {
  const code = (err as { code?: unknown })?.code;
  if (code === 'ER_NO_REFERENCED_ROW_2') return 'MISSING_PARENT';
  if (code === 'ER_DUP_ENTRY') return 'DUPLICATE';
  if (code === 'ER_CHECK_CONSTRAINT_VIOLATED' || code === 'ER_TRUNCATED_WRONG_VALUE') return 'INVALID';
  return undefined;
}

/**
 * Validates and writes one full record for `userId`. Must run inside a transaction.
 * Constraint violations (missing parent, duplicate natural key) are thrown as MySQL errors;
 * see `constraintErrorCode`.
 */
export async function applyRecord<E extends EntityName>(
  conn: PoolConnection,
  userId: string,
  entity: E,
  input: unknown,
  opts: ApplyOptions,
): Promise<ApplyOutcome<E>> {
  const def = ENTITIES[entity];
  const parsed = def.schema.safeParse(input);
  if (!parsed.success) return { status: 'rejected', errorCode: 'INVALID', details: zodDetails(parsed.error) };
  const rec = { ...(parsed.data as Record<string, unknown>) };

  const maxTs = opts.now.getTime() + MAX_CLOCK_SKEW_MS;
  for (const k of ['createdAt', 'updatedAt', 'deletedAt']) {
    const v = rec[k];
    if (typeof v === 'string' && Date.parse(v) > maxTs) rec[k] = opts.now.toISOString();
  }

  // Look up by id alone (not user) so a collision with another user's record is detected.
  const [rows] = await conn.execute<Row[]>(
    `SELECT user_id, server_seq, ${columnList(entity)} FROM ${def.table} WHERE id = ? FOR UPDATE`,
    [rec.id as string],
  );
  const existingRow = rows[0];
  if (existingRow && existingRow.user_id !== userId) return { status: 'rejected', errorCode: 'ID_CONFLICT' };
  const existing = existingRow ? rowToRecord(entity, existingRow) : undefined;

  // Built-in question markers are owned by the server.
  if (entity === 'journalQuestions') {
    rec.systemKey = existing ? (existing as Record<string, unknown>).systemKey : null;
  }

  if (existing) {
    if (sameContent(entity, existing, rec)) {
      return { status: 'applied', serverSeq: existing.serverSeq, changed: false };
    }
    if (def.stickyDelete && existing.deletedAt) return { status: 'stale', serverRecord: existing };

    const versioned = entity === 'journalAnswers' && rec.questionTypeSnapshot === 'text' && opts.baseSeq !== undefined;
    if (versioned) {
      if (existing.serverSeq > (opts.baseSeq ?? 0)) return { status: 'conflict', serverRecord: existing };
    } else if (Date.parse(rec.updatedAt as string) <= Date.parse(existing.updatedAt)) {
      return { status: 'stale', serverRecord: existing };
    }
  }

  const seq = await allocateSeq(conn, userId);
  const fields = def.fields;
  const values = fields.map((fd) => toDb(fd.type, rec[fd.field]));

  if (existing) {
    const sets = fields.filter((fd) => fd.col !== 'id' && fd.col !== 'created_at').map((fd) => `${fd.col} = ?`);
    const setValues = fields
      .map((fd, i) => [fd, values[i]] as const)
      .filter(([fd]) => fd.col !== 'id' && fd.col !== 'created_at')
      .map(([, v]) => v);
    await conn.query(`UPDATE ${def.table} SET ${sets.join(', ')}, server_seq = ? WHERE id = ? AND user_id = ?`, [
      ...setValues,
      seq,
      rec.id,
      userId,
    ]);
  } else {
    await conn.query(
      `INSERT INTO ${def.table} (user_id, server_seq, ${columnList(entity)}) VALUES (?, ?, ${fields.map(() => '?').join(', ')})`,
      [userId, seq, ...values],
    );
  }
  return { status: 'applied', serverSeq: seq, changed: true };
}
