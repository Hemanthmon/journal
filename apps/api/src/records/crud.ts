import type { PoolConnection } from 'mysql2/promise';
import { ErrorCode, type EntityName } from '@journal/shared';
import { AppError, notFound } from '../lib/errors';
import { applyRecord, constraintErrorCode, findRecord, type ServerRecord } from './records';

/**
 * Helpers for CRUD routes, which write through the same `applyRecord` as sync but turn
 * rejections into HTTP errors.
 */

export async function saveRecord<E extends EntityName>(
  conn: PoolConnection,
  userId: string,
  entity: E,
  record: Record<string, unknown>,
): Promise<ServerRecord<E>> {
  let outcome;
  try {
    outcome = await applyRecord(conn, userId, entity, record, { now: new Date() });
  } catch (err) {
    const code = constraintErrorCode(err);
    if (code === 'MISSING_PARENT') throw notFound('A referenced record was not found');
    if (code === 'DUPLICATE') throw new AppError(409, ErrorCode.CONFLICT, 'A record for this already exists');
    if (code === 'INVALID') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid value');
    throw err;
  }
  if (outcome.status === 'rejected') {
    if (outcome.errorCode === 'ID_CONFLICT') throw new AppError(409, ErrorCode.CONFLICT, 'This id is already in use');
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request', outcome.details);
  }
  if (outcome.status !== 'applied') throw notFound();
  const saved = await findRecord(conn, entity, userId, record.id as string, { includeDeleted: true });
  if (!saved) throw notFound();
  return saved;
}

/** Loads a live (non-deleted) record for editing, locking it, or throws 404. */
export async function loadForUpdate<E extends EntityName>(
  conn: PoolConnection,
  entity: E,
  userId: string,
  id: string,
): Promise<ServerRecord<E>> {
  const rec = await findRecord(conn, entity, userId, id, { forUpdate: true });
  if (!rec) throw notFound();
  return rec;
}

/**
 * Timestamp for an edit made by the server: now, but always later than the stored
 * `updatedAt` (which may come from a device whose clock runs slightly ahead), so the
 * edit wins last-write-wins.
 */
export function editTime(existing?: { updatedAt: string }): string {
  const now = Date.now();
  const after = existing ? Date.parse(existing.updatedAt) + 1 : 0;
  return new Date(Math.max(now, after)).toISOString();
}

/** Strips `serverSeq` so a loaded record can be written back. */
export function withoutSeq<T extends { serverSeq: number }>(rec: T): Omit<T, 'serverSeq'> {
  const { serverSeq: _seq, ...rest } = rec;
  return rest;
}

/** Soft-deletes a record. Deleting an already-deleted record succeeds (idempotent). */
export async function softDelete(conn: PoolConnection, entity: EntityName, userId: string, id: string) {
  const rec = await findRecord(conn, entity, userId, id, { includeDeleted: true, forUpdate: true });
  if (!rec) throw notFound();
  if (rec.deletedAt) return;
  const now = editTime(rec);
  await saveRecord(conn, userId, entity, { ...withoutSeq(rec), deletedAt: now, updatedAt: now });
}

/** Sets display_order to each id's position. All ids must be the user's live records. */
export async function reorder(
  conn: PoolConnection,
  entity: 'habits' | 'journalQuestions',
  userId: string,
  ids: string[],
) {
  const records = [];
  for (const id of ids) records.push(await loadForUpdate(conn, entity, userId, id));
  for (const [i, rec] of records.entries()) {
    if (rec.displayOrder !== i) {
      await saveRecord(conn, userId, entity, { ...withoutSeq(rec), displayOrder: i, updatedAt: editTime(rec) });
    }
  }
}

/** Builds `AND t.local_date BETWEEN` style filters for optional from/to. */
export function dateFilter(column: string, from?: string, to?: string): { where: string[]; params: string[] } {
  const where: string[] = [];
  const params: string[] = [];
  if (from) {
    where.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${column} <= ?`);
    params.push(to);
  }
  return { where, params };
}
