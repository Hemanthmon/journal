import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import {
  ENTITIES,
  ErrorCode,
  addDays,
  occurrenceOf,
  seriesDates,
  seriesInstanceId,
  type BlockColor,
  type EntityName,
  type PlanTaskRecord,
  type RepeatFrequency,
  type RepeatSeriesRecord,
  type TimeBlockRecord,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, notFound } from '../../lib/errors';
import { applyRecord, findRecord, rowToRecord } from '../../records/records';
import { notifyBlocksChanged } from './blocks';

/**
 * Repeating blocks and tasks on the server: the same rules as the app (data/series.ts),
 * used by the website and before Google sync. Occurrences have deterministic ids, so
 * whichever side creates one first, the others merge with it.
 */

type Row = RowDataPacket & Record<string, unknown>;
const AHEAD_DAYS = 120;

type Write = { entity: EntityName; record: Record<string, unknown> };

/** Writes records in one transaction, with server timestamps newer than what's stored. */
async function writeAll(userId: string, writes: Write[]) {
  if (!writes.length) return;
  await withTransaction(async (conn) => {
    const now = new Date();
    for (const { entity, record } of writes) {
      const existing = await findRecord(conn, entity, userId, String(record.id), { includeDeleted: true });
      const updatedAt = new Date(Math.max(now.getTime(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString();
      const out = await applyRecord(conn, userId, entity, { createdAt: existing?.createdAt ?? now.toISOString(), ...record, updatedAt }, { now });
      if (out.status === 'rejected') throw new AppError(400, ErrorCode.VALIDATION_ERROR, out.details?.[0]?.message ?? 'That change is not valid.', out.details);
    }
  });
}

const write = (userId: string, entity: EntityName, record: Record<string, unknown>) => writeAll(userId, [{ entity, record }]);

const del = (userId: string, entity: EntityName, record: Record<string, unknown>) =>
  write(userId, entity, { ...record, deletedAt: new Date().toISOString() });

async function listSeries(userId: string): Promise<RepeatSeriesRecord[]> {
  const def = ENTITIES.repeatSeries;
  const [rows] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table} WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return rows.map((r) => rowToRecord('repeatSeries', r));
}

/** Creates any missing occurrences in [from, to] (capped a few months ahead of today). */
export async function ensureOccurrencesFor(userId: string, from: string, to: string, today: string): Promise<number> {
  const cap = addDays(today, AHEAD_DAYS);
  const end = to < cap ? to : cap;
  if (end < from) return 0;
  const writes: Write[] = [];
  for (const s of await listSeries(userId)) {
    const dates = seriesDates(s, from, end);
    if (!dates.length) continue;
    const ids = dates.map((d) => seriesInstanceId(userId, s.id, d));
    const table = s.kind === 'block' ? 'time_blocks' : 'plan_tasks';
    const [have] = await getPool().query<Row[]>(`SELECT id FROM ${table} WHERE id IN (?)`, [ids]);
    const exists = new Set(have.map((r) => String(r.id)));
    const now = new Date().toISOString();
    for (const d of dates) {
      if (exists.has(seriesInstanceId(userId, s.id, d))) continue;
      const o = occurrenceOf(s, userId, d, now);
      writes.push({ entity: o.kind === 'block' ? 'timeBlocks' : 'planTasks', record: o.record });
    }
  }
  // One transaction for all of them: a new series is a single round trip, not one per day.
  await writeAll(userId, writes);
  if (writes.some((w) => w.entity === 'timeBlocks')) notifyBlocksChanged(userId);
  return writes.length;
}

export interface RepeatChoice {
  frequency: RepeatFrequency;
  days: number[];
  endDate: string | null;
}

export interface SeriesFields {
  title: string;
  startTime: string | null;
  endTime: string | null;
  color: BlockColor | null;
  identityId: string | null;
  notes?: string | null;
  place?: string | null;
  twoMinute?: string | null;
}

export async function createSeriesFor(userId: string, kind: 'block' | 'task', startDate: string, fields: SeriesFields, repeat: RepeatChoice, today: string) {
  const id = randomUUID();
  await write(userId, 'repeatSeries', {
    id,
    deletedAt: null,
    kind,
    startDate,
    endDate: repeat.endDate,
    frequency: repeat.frequency,
    days: repeat.frequency === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : repeat.days,
    notes: null,
    place: null,
    twoMinute: null,
    ...fields,
  });
  // The next two weeks now; later days are created as they come into view.
  await ensureOccurrencesFor(userId, startDate, addDays(startDate, 13), today < startDate ? startDate : today);
  return id;
}

async function getItem(userId: string, kind: 'block' | 'task', id: string) {
  const item = await findRecord(getPool(), kind === 'block' ? 'timeBlocks' : 'planTasks', userId, id);
  if (!item) throw notFound('This no longer exists. Reload the page.');
  return item as (TimeBlockRecord | PlanTaskRecord) & { serverSeq: number };
}

async function endSeriesBefore(userId: string, s: RepeatSeriesRecord, date: string) {
  if (date <= s.startDate) await del(userId, 'repeatSeries', s);
  else await write(userId, 'repeatSeries', { ...s, endDate: addDays(date, -1) });
}

async function removeFollowing(userId: string, s: RepeatSeriesRecord, date: string) {
  const entity = s.kind === 'block' ? 'timeBlocks' : 'planTasks';
  const def = ENTITIES[entity];
  const [rows] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table}
      WHERE user_id = ? AND series_id = ? AND local_date >= ? AND deleted_at IS NULL${s.kind === 'task' ? ' AND completed_at IS NULL' : ''}`,
    [userId, s.id, date],
  );
  const at = new Date().toISOString();
  await writeAll(userId, rows.map((r) => ({ entity, record: { ...rowToRecord(entity, r), deletedAt: at } })));
}

async function seriesOf(userId: string, item: { seriesId?: string | null }) {
  if (!item.seriesId) return undefined;
  return (await findRecord(getPool(), 'repeatSeries', userId, item.seriesId)) as RepeatSeriesRecord | undefined;
}

export async function deleteOccurrenceFor(userId: string, kind: 'block' | 'task', id: string, scope: 'one' | 'following') {
  const item = await getItem(userId, kind, id);
  await del(userId, kind === 'block' ? 'timeBlocks' : 'planTasks', item);
  const s = scope === 'following' ? await seriesOf(userId, item) : undefined;
  if (s) {
    await endSeriesBefore(userId, s, item.localDate);
    await removeFollowing(userId, s, item.localDate);
  }
  if (kind === 'block') notifyBlocksChanged(userId);
}

export async function editOccurrenceFor(
  userId: string,
  kind: 'block' | 'task',
  id: string,
  changes: { date: string; fields: SeriesFields; repeat: RepeatChoice | null },
  scope: 'one' | 'following',
  today: string,
) {
  const item = await getItem(userId, kind, id);
  const s = await seriesOf(userId, item);
  const f = changes.fields;
  if (scope === 'one' || !s) {
    // A one-off that now repeats: a series takes its place from this day on.
    if (!s && changes.repeat) {
      await del(userId, kind === 'block' ? 'timeBlocks' : 'planTasks', item);
      await createSeriesFor(userId, kind, changes.date, f, changes.repeat, today);
    } else if (kind === 'block') {
      await write(userId, 'timeBlocks', { ...item, title: f.title, localDate: changes.date, startTime: f.startTime, endTime: f.endTime, color: f.color, identityId: f.identityId, notes: f.notes ?? null });
    } else {
      await write(userId, 'planTasks', { ...item, title: f.title, localDate: changes.date, localTime: f.startTime, identityId: f.identityId, place: f.place ?? null, twoMinute: f.twoMinute ?? null });
    }
  } else {
    await endSeriesBefore(userId, s, item.localDate);
    await removeFollowing(userId, s, item.localDate);
    if (changes.repeat) await createSeriesFor(userId, kind, changes.date, f, changes.repeat, today);
    else if (kind === 'block')
      await write(userId, 'timeBlocks', { id: randomUUID(), deletedAt: null, seriesId: null, localDate: changes.date, title: f.title, startTime: f.startTime, endTime: f.endTime, color: f.color, identityId: f.identityId, notes: f.notes ?? null });
    else
      await write(userId, 'planTasks', { id: randomUUID(), deletedAt: null, seriesId: null, localDate: changes.date, title: f.title, identityId: f.identityId, goalId: null, localTime: f.startTime, place: f.place ?? null, twoMinute: f.twoMinute ?? null, completedAt: null, displayOrder: 0 });
  }
  if (kind === 'block') notifyBlocksChanged(userId);
}
