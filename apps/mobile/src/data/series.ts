import {
  addDays,
  occurrenceOf,
  seriesDates,
  seriesInstanceId,
  type BlockColor,
  type PlanTaskRecord,
  type RepeatFrequency,
  type RepeatSeriesRecord,
  type TimeBlockRecord,
} from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

/**
 * Repeating blocks and tasks. A series (`repeatSeries`) says what repeats; each day's
 * occurrence is an ordinary block or task with a deterministic id, created here the first
 * time that day is looked at. A deleted occurrence keeps its tombstone, so it's never
 * recreated.
 */

/** How far ahead occurrences are created (reminders need the next few days). */
const AHEAD_DAYS = 120;

export interface RepeatChoice {
  frequency: RepeatFrequency;
  /** Weekdays for 'custom' (and the start day for 'weekly'). */
  days: number[];
  endDate: string | null;
}

export function listSeries(ctx: Ctx): Promise<RepeatSeriesRecord[]> {
  return listLocal(ctx.db, 'repeatSeries');
}

export async function getSeries(ctx: Ctx, id: string): Promise<RepeatSeriesRecord | undefined> {
  const row = await getLocal(ctx.db, 'repeatSeries', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

/** Creates any missing occurrences in [from, to] (capped a few months ahead of today). */
export async function ensureOccurrences(ctx: Ctx, from: string, to: string, today: string): Promise<number> {
  const cap = addDays(today, AHEAD_DAYS);
  const end = to < cap ? to : cap;
  if (end < from) return 0;
  const series = await listSeries(ctx);
  let created = 0;
  for (const s of series) {
    const dates = seriesDates(s, from, end);
    if (!dates.length) continue;
    const ids = dates.map((d) => seriesInstanceId(ctx.userId, s.id, d));
    const table = s.kind === 'block' ? 'time_blocks' : 'plan_tasks';
    // Existing rows, deleted ones included: a removed occurrence stays removed.
    const have = new Set(
      (await ctx.db.all<{ id: string }>(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((r) => r.id),
    );
    const now = ctx.now().toISOString();
    for (const d of dates) {
      if (have.has(seriesInstanceId(ctx.userId, s.id, d))) continue;
      const o = occurrenceOf(s, ctx.userId, d, now);
      if (o.kind === 'block') await writeLocal(ctx, 'timeBlocks', o.record);
      else await writeLocal(ctx, 'planTasks', o.record);
      created++;
    }
  }
  return created;
}

// ------------------------------------------------------------------ creating

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

/** Turns a new block or task into a repeating series starting on `startDate`. */
export async function createSeries(ctx: Ctx, kind: 'block' | 'task', startDate: string, fields: SeriesFields, repeat: RepeatChoice) {
  const now = ctx.now().toISOString();
  const s = await writeLocal(ctx, 'repeatSeries', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
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
  await ensureOccurrences(ctx, startDate, addDays(startDate, 13), startDate);
  return s;
}

// ------------------------------------------------------------------ editing an occurrence

export type Scope = 'one' | 'following';

/** Ends a series the day before `date` (or removes it if it would have no days left). */
async function endSeriesBefore(ctx: Ctx, s: RepeatSeriesRecord, date: string) {
  const t = editTime(ctx, s);
  if (date <= s.startDate) await writeLocal(ctx, 'repeatSeries', { ...s, deletedAt: t, updatedAt: t });
  else await writeLocal(ctx, 'repeatSeries', { ...s, endDate: addDays(date, -1), updatedAt: t });
}

/** Removes the series' occurrences from `date` on (finished tasks are kept). */
async function removeFollowing(ctx: Ctx, s: RepeatSeriesRecord, date: string) {
  if (s.kind === 'block') {
    const rows = await listLocal(ctx.db, 'timeBlocks', { where: 'series_id = ? AND local_date >= ?', params: [s.id, date] });
    for (const b of rows) {
      const t = editTime(ctx, b);
      await writeLocal(ctx, 'timeBlocks', { ...b, deletedAt: t, updatedAt: t });
    }
  } else {
    const rows = await listLocal(ctx.db, 'planTasks', { where: 'series_id = ? AND local_date >= ? AND completed_at IS NULL', params: [s.id, date] });
    for (const x of rows) {
      const t = editTime(ctx, x);
      await writeLocal(ctx, 'planTasks', { ...x, deletedAt: t, updatedAt: t });
    }
  }
}

/** Deletes one occurrence, or it and every later one (the series ends there). */
export async function deleteOccurrence(ctx: Ctx, item: TimeBlockRecord | PlanTaskRecord, kind: 'block' | 'task', scope: Scope) {
  const entity = kind === 'block' ? 'timeBlocks' : 'planTasks';
  const t = editTime(ctx, item);
  await writeLocal(ctx, entity, { ...item, deletedAt: t, updatedAt: t });
  if (scope === 'one' || !item.seriesId) return;
  const s = await getSeries(ctx, item.seriesId);
  if (!s) return;
  await endSeriesBefore(ctx, s, item.localDate);
  await removeFollowing(ctx, s, item.localDate);
}

/**
 * Saves changes to an occurrence of a series.
 *  one:       only this day changes (it stays linked to the series).
 *  following: the old series ends the day before; a new one starts here with the new
 *             details (and repeat rule), and the old later occurrences are replaced.
 */
export async function editOccurrence(
  ctx: Ctx,
  kind: 'block' | 'task',
  item: TimeBlockRecord | PlanTaskRecord,
  changes: { date: string; fields: SeriesFields; repeat: RepeatChoice | null },
  scope: Scope,
) {
  const s = item.seriesId ? await getSeries(ctx, item.seriesId) : undefined;
  if (scope === 'one' || !s) {
    const t = editTime(ctx, item);
    if (kind === 'block') {
      const b = item as TimeBlockRecord;
      await writeLocal(ctx, 'timeBlocks', {
        ...b,
        title: changes.fields.title,
        localDate: changes.date,
        startTime: changes.fields.startTime!,
        endTime: changes.fields.endTime!,
        color: changes.fields.color!,
        identityId: changes.fields.identityId,
        notes: changes.fields.notes ?? null,
        updatedAt: t,
      });
    } else {
      const x = item as PlanTaskRecord;
      await writeLocal(ctx, 'planTasks', {
        ...x,
        title: changes.fields.title,
        localDate: changes.date,
        localTime: changes.fields.startTime,
        identityId: changes.fields.identityId,
        place: changes.fields.place ?? null,
        twoMinute: changes.fields.twoMinute ?? null,
        updatedAt: t,
      });
    }
    return;
  }
  await endSeriesBefore(ctx, s, item.localDate);
  await removeFollowing(ctx, s, item.localDate);
  if (changes.repeat) {
    await createSeries(ctx, kind, changes.date, changes.fields, changes.repeat);
  } else {
    // "Doesn't repeat" from here on: keep just this day, as a one-off.
    const now = ctx.now().toISOString();
    if (kind === 'block') {
      await writeLocal(ctx, 'timeBlocks', {
        id: ctx.uuid(), createdAt: now, updatedAt: now, deletedAt: null, seriesId: null, localDate: changes.date,
        title: changes.fields.title, startTime: changes.fields.startTime!, endTime: changes.fields.endTime!, color: changes.fields.color!,
        identityId: changes.fields.identityId, notes: changes.fields.notes ?? null,
      });
    } else {
      await writeLocal(ctx, 'planTasks', {
        id: ctx.uuid(), createdAt: now, updatedAt: now, deletedAt: null, seriesId: null, localDate: changes.date,
        title: changes.fields.title, identityId: changes.fields.identityId, goalId: null, localTime: changes.fields.startTime,
        place: changes.fields.place ?? null, twoMinute: changes.fields.twoMinute ?? null, completedAt: null, displayOrder: 0,
      });
    }
  }
}

/** The repeat rule shown in an editor for an occurrence (null = doesn't repeat). */
export async function repeatOf(ctx: Ctx, item: { seriesId?: string | null }): Promise<{ series: RepeatSeriesRecord; choice: RepeatChoice } | null> {
  if (!item.seriesId) return null;
  const s = await getSeries(ctx, item.seriesId);
  return s ? { series: s, choice: { frequency: s.frequency, days: s.days, endDate: s.endDate } } : null;
}
