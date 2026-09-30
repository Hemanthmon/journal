import {
  ALL_WEEKDAYS,
  habitLogId,
  habitProgress,
  isScheduledOn,
  toLocalDate,
  type HabitLogRecord,
  type HabitRecord,
  type MeasurementType,
} from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

export interface HabitDraft {
  name: string;
  description?: string | null;
  measurementType: MeasurementType;
  targetValue?: number;
  unit?: string | null;
  scheduleDays?: number[];
  isActive?: boolean;
}

/** All non-deleted habits (active, disabled and archived) in display order. */
export function listHabits(ctx: Ctx): Promise<HabitRecord[]> {
  return listLocal(ctx.db, 'habits', { orderBy: 'display_order, created_at' });
}

export async function getHabit(ctx: Ctx, id: string): Promise<HabitRecord | undefined> {
  const row = await getLocal(ctx.db, 'habits', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

export async function createHabit(ctx: Ctx, draft: HabitDraft): Promise<HabitRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>(
    'SELECT MAX(display_order) AS m FROM habits WHERE deleted_at IS NULL',
  );
  return writeLocal(ctx, 'habits', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: draft.name,
    description: draft.description ?? null,
    measurementType: draft.measurementType,
    targetValue: draft.measurementType === 'boolean' ? 1 : draft.targetValue,
    unit: draft.unit ?? null,
    scheduleDays: draft.scheduleDays ?? ALL_WEEKDAYS,
    isActive: draft.isActive ?? true,
    archivedAt: null,
    displayOrder: (max?.m ?? -1) + 1,
  });
}

/**
 * Edits a habit definition. Existing habit logs keep their own target/unit snapshot, so
 * history is unaffected.
 */
export async function updateHabit(
  ctx: Ctx,
  id: string,
  patch: Partial<HabitDraft> & { archived?: boolean; displayOrder?: number },
): Promise<HabitRecord> {
  const current = await getHabit(ctx, id);
  if (!current) throw new Error('Habit not found');
  const { archived, ...fields } = patch;
  const next: Record<string, unknown> = { ...current, ...fields, updatedAt: editTime(ctx, current) };
  if (next.measurementType === 'boolean') next.targetValue = 1;
  if (archived !== undefined) next.archivedAt = archived ? (current.archivedAt ?? ctx.now().toISOString()) : null;
  return writeLocal(ctx, 'habits', next);
}

/** Soft delete: the habit disappears, its logs stay in history. */
export async function deleteHabit(ctx: Ctx, id: string): Promise<void> {
  const current = await getHabit(ctx, id);
  if (!current) return;
  const t = editTime(ctx, current);
  await writeLocal(ctx, 'habits', { ...current, deletedAt: t, updatedAt: t });
}

/** Saves a new order (ids in display order). Only changed rows are rewritten. */
export async function reorderHabits(ctx: Ctx, ids: string[]): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const row = await getLocal(tx, 'habits', id);
      if (row && row.record.displayOrder !== i) {
        await writeLocal(ctx, 'habits', { ...row.record, displayOrder: i, updatedAt: editTime(ctx, row.record) }, { tx });
      }
    }
  });
  ctx.onWrite?.();
}

/** Local calendar date on which a habit was created (device time zone). */
const createdOn = (h: HabitRecord) => toLocalDate(new Date(h.createdAt));

export interface HabitForDay {
  habit: HabitRecord;
  log: HabitLogRecord | undefined;
  /** Value recorded (0 if nothing yet). */
  value: number;
  /** Target used for this day: the log's snapshot if one exists, else the current target. */
  target: number;
  unit: string | null;
  type: MeasurementType;
  progress: number;
}

/**
 * Habits to show for a date: active habits scheduled on that weekday that existed on
 * that date, plus any habit that already has a log that day (even if since disabled or
 * archived). Unscheduled habits never count as missed.
 */
export async function habitsForDate(ctx: Ctx, localDate: string): Promise<HabitForDay[]> {
  const [habits, logs] = await Promise.all([
    listHabits(ctx),
    listLocal(ctx.db, 'habitLogs', { where: 'local_date = ?', params: [localDate] }),
  ]);
  const logByHabit = new Map(logs.map((l) => [l.habitId, l]));
  return habits
    .filter((h) => {
      if (logByHabit.has(h.id)) return true;
      return h.isActive && !h.archivedAt && isScheduledOn(h.scheduleDays, localDate) && createdOn(h) <= localDate;
    })
    .map((habit) => {
      const log = logByHabit.get(habit.id);
      const value = log?.value ?? 0;
      const target = log?.targetSnapshot ?? habit.targetValue;
      const type = log?.typeSnapshot ?? habit.measurementType;
      return {
        habit,
        log,
        value,
        target,
        unit: log ? log.unitSnapshot : habit.unit,
        type,
        progress: habitProgress(type, value, target),
      };
    });
}

/**
 * Records progress for a habit on a date. Partial values are kept as entered; boolean
 * habits store 0 or 1. The first log of a day snapshots the habit's target and unit.
 */
export async function setHabitValue(ctx: Ctx, habit: HabitRecord, localDate: string, value: number) {
  const clean =
    habit.measurementType === 'boolean' ? (value >= 1 ? 1 : 0) : Math.max(0, Math.round(value * 100) / 100);
  const id = habitLogId(ctx.userId, habit.id, localDate);
  const existing = await getLocal(ctx.db, 'habitLogs', id);
  const now = editTime(ctx, existing?.record);
  const base = existing
    ? existing.record
    : {
        id,
        createdAt: now,
        habitId: habit.id,
        localDate,
        targetSnapshot: habit.targetValue,
        unitSnapshot: habit.unit,
        typeSnapshot: habit.measurementType,
      };
  return writeLocal(ctx, 'habitLogs', {
    ...base,
    value: base.typeSnapshot === 'boolean' ? (clean >= 1 ? 1 : 0) : clean,
    updatedAt: now,
    deletedAt: null,
  });
}
