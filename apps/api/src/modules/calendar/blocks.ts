import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import {
  ENTITIES,
  type BlockInput,
  type CalendarBlock,
  type DashboardCalendar,
  type TimeBlockRecord,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, notFound } from '../../lib/errors';
import { ErrorCode } from '@journal/shared';
import { applyRecord, findRecord, rowToRecord } from '../../records/records';

type Row = RowDataPacket & Record<string, unknown>;

/**
 * Calendar blocks written by the server: from the website (the owner), and from Google
 * Calendar imports. They go through the same `applyRecord` as app sync, so every device
 * receives them on its next pull.
 */

type Listener = (userId: string) => void;
const listeners: Listener[] = [];

/** Google sync subscribes here to push new block versions out. */
export function onBlocksChanged(fn: Listener) {
  listeners.push(fn);
}

export function notifyBlocksChanged(userId: string) {
  for (const fn of listeners) fn(userId);
}

/** Writes a full block record for `userId` with a fresh updatedAt. Returns the stored record. */
export async function writeBlock(userId: string, record: TimeBlockRecord, opts: { notify?: boolean } = {}): Promise<TimeBlockRecord & { serverSeq: number }> {
  const now = new Date();
  const result = await withTransaction(async (conn) => {
    const existing = await findRecord(conn, 'timeBlocks', userId, record.id, { includeDeleted: true });
    // Always newer than what's stored, so a server edit is never mistaken for a stale one.
    const updatedAt = new Date(Math.max(now.getTime(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString();
    const outcome = await applyRecord(conn, userId, 'timeBlocks', { ...record, updatedAt }, { now });
    if (outcome.status === 'rejected') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, outcome.details?.[0]?.message ?? 'Invalid block', outcome.details);
    }
    if (outcome.status !== 'applied') throw new AppError(409, ErrorCode.CONFLICT, 'This block was changed elsewhere. Reload and try again.');
    const stored = await findRecord(conn, 'timeBlocks', userId, record.id, { includeDeleted: true });
    return stored!;
  });
  if (opts.notify !== false) notifyBlocksChanged(userId);
  return result as TimeBlockRecord & { serverSeq: number };
}

export async function createBlockFor(userId: string, input: BlockInput) {
  const now = new Date().toISOString();
  return writeBlock(userId, {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    title: input.title,
    localDate: input.localDate,
    startTime: input.startTime,
    endTime: input.endTime,
    color: input.color,
    identityId: input.identityId ?? null,
    notes: input.notes ?? null,
  });
}

export async function updateBlockFor(userId: string, id: string, input: BlockInput) {
  const current = await findRecord(getPool(), 'timeBlocks', userId, id);
  if (!current) throw notFound('Block not found');
  return writeBlock(userId, {
    ...current,
    title: input.title,
    localDate: input.localDate,
    startTime: input.startTime,
    endTime: input.endTime,
    color: input.color,
    identityId: input.identityId ?? null,
    notes: input.notes ?? null,
  });
}

export async function deleteBlockFor(userId: string, id: string) {
  const current = await findRecord(getPool(), 'timeBlocks', userId, id);
  if (!current) throw notFound('Block not found');
  return writeBlock(userId, { ...current, deletedAt: new Date().toISOString() });
}

async function load<E extends 'timeBlocks' | 'planTasks' | 'identities'>(entity: E, userId: string, where = '', params: unknown[] = []) {
  const def = ENTITIES[entity];
  const [rows] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table}
      WHERE user_id = ? AND deleted_at IS NULL${where}`,
    [userId, ...params],
  );
  return rows.map((r) => rowToRecord(entity, r));
}

export async function calendarView(
  userId: string,
  range: { from: string; to: string; today: string; canEdit: boolean },
): Promise<DashboardCalendar> {
  const [blocks, tasks, identities, google] = await Promise.all([
    load('timeBlocks', userId, ' AND local_date BETWEEN ? AND ?', [range.from, range.to]),
    load('planTasks', userId, ' AND local_time IS NOT NULL AND local_date BETWEEN ? AND ?', [range.from, range.to]),
    load('identities', userId),
    getPool().query<Row[]>('SELECT last_sync_at FROM google_accounts WHERE user_id = ?', [userId]),
  ]);
  const name = new Map(identities.map((i) => [i.id, i.statement]));
  const hhmm = (t: string) => t.slice(0, 5);
  const out: CalendarBlock[] = blocks
    .map((b) => ({
      id: b.id,
      title: b.title,
      date: b.localDate,
      start: hhmm(b.startTime),
      end: hhmm(b.endTime),
      color: b.color,
      identityId: b.identityId,
      identity: b.identityId ? (name.get(b.identityId) ?? null) : null,
      notes: b.notes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const g = google[0][0];
  return {
    from: range.from,
    to: range.to,
    today: range.today,
    canEdit: range.canEdit,
    blocks: out,
    tasks: tasks
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: t.localDate,
        time: hhmm(t.localTime!),
        done: !!t.completedAt,
        identity: t.identityId ? (name.get(t.identityId) ?? null) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    identities: identities.filter((i) => i.isActive).map((i) => ({ id: i.id, statement: i.statement })),
    google: { connected: !!g, lastSyncAt: g?.last_sync_at ? (g.last_sync_at as Date).toISOString() : null },
  };
}
