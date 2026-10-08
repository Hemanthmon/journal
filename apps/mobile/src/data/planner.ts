import {
  addDays,
  dateRange,
  periodEnd,
  planReviewId,
  weekStartOf,
  type IdentityRecord,
  type PlanGoalRecord,
  type PlanLevel,
  type PlanReviewRecord,
  type PlanTaskRecord,
} from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

/**
 * Planner (Atomic Habits). Identities are who the user is becoming; every completed task
 * linked to one is a "vote" for it. Monthly focuses → weekly goals → daily tasks.
 */

// ------------------------------------------------------------------ periods

export { monthStartOf, periodEnd, periodStartOf, shiftPeriod, weekStartOf } from '@journal/shared';

// ------------------------------------------------------------------ identities

export function listIdentities(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Promise<IdentityRecord[]> {
  return listLocal(ctx.db, 'identities', {
    where: opts.includeArchived ? undefined : 'is_active = 1',
    orderBy: 'display_order, created_at',
  });
}

export async function createIdentity(ctx: Ctx, statement: string): Promise<IdentityRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>('SELECT MAX(display_order) AS m FROM identities WHERE deleted_at IS NULL');
  return writeLocal(ctx, 'identities', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    statement,
    isActive: true,
    displayOrder: (max?.m ?? -1) + 1,
  });
}

async function current<E extends 'identities' | 'planGoals' | 'planTasks'>(ctx: Ctx, entity: E, id: string) {
  const row = await getLocal(ctx.db, entity, id);
  if (!row || row.record.deletedAt) throw new Error('This item no longer exists');
  return row.record;
}

export async function updateIdentity(ctx: Ctx, id: string, patch: Partial<Pick<IdentityRecord, 'statement' | 'isActive'>>) {
  const cur = await current(ctx, 'identities', id);
  return writeLocal(ctx, 'identities', { ...cur, ...patch, updatedAt: editTime(ctx, cur) });
}

export async function deleteIdentity(ctx: Ctx, id: string): Promise<void> {
  const cur = await current(ctx, 'identities', id);
  const t = editTime(ctx, cur);
  await writeLocal(ctx, 'identities', { ...cur, deletedAt: t, updatedAt: t });
}

// ------------------------------------------------------------------ goals

export function listGoals(ctx: Ctx, level: PlanLevel, periodStart: string): Promise<PlanGoalRecord[]> {
  return listLocal(ctx.db, 'planGoals', {
    where: 'level = ? AND period_start = ?',
    params: [level, periodStart],
    orderBy: 'display_order, created_at',
  });
}

export interface GoalDraft {
  level: PlanLevel;
  periodStart: string;
  text: string;
  identityId?: string | null;
  parentId?: string | null;
}

export async function createGoal(ctx: Ctx, d: GoalDraft): Promise<PlanGoalRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>(
    'SELECT MAX(display_order) AS m FROM plan_goals WHERE deleted_at IS NULL AND level = ? AND period_start = ?',
    [d.level, d.periodStart],
  );
  return writeLocal(ctx, 'planGoals', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    level: d.level,
    periodStart: d.periodStart,
    text: d.text,
    identityId: d.identityId ?? null,
    parentId: d.level === 'week' ? (d.parentId ?? null) : null,
    doneAt: null,
    displayOrder: (max?.m ?? -1) + 1,
  });
}

export async function updateGoal(ctx: Ctx, id: string, patch: Partial<Pick<PlanGoalRecord, 'text' | 'identityId' | 'parentId'>>) {
  const cur = await current(ctx, 'planGoals', id);
  return writeLocal(ctx, 'planGoals', { ...cur, ...patch, updatedAt: editTime(ctx, cur) });
}

export async function toggleGoalDone(ctx: Ctx, id: string): Promise<PlanGoalRecord> {
  const cur = await current(ctx, 'planGoals', id);
  const t = editTime(ctx, cur);
  return writeLocal(ctx, 'planGoals', { ...cur, doneAt: cur.doneAt ? null : t, updatedAt: t });
}

export async function deleteGoal(ctx: Ctx, id: string): Promise<void> {
  const cur = await current(ctx, 'planGoals', id);
  const t = editTime(ctx, cur);
  await writeLocal(ctx, 'planGoals', { ...cur, deletedAt: t, updatedAt: t });
}

// ------------------------------------------------------------------ tasks

export function tasksInRange(ctx: Ctx, from: string, to: string): Promise<PlanTaskRecord[]> {
  return listLocal(ctx.db, 'planTasks', {
    where: 'local_date BETWEEN ? AND ?',
    params: [from, to],
    // Timed tasks first in time order, then untimed in the order they were added.
    orderBy: 'local_date, local_time IS NULL, local_time, display_order, created_at',
  });
}

export const tasksForDate = (ctx: Ctx, localDate: string) => tasksInRange(ctx, localDate, localDate);

export async function getTask(ctx: Ctx, id: string): Promise<PlanTaskRecord | undefined> {
  const row = await getLocal(ctx.db, 'planTasks', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

export interface TaskDraft {
  title: string;
  localDate: string;
  identityId?: string | null;
  goalId?: string | null;
  localTime?: string | null;
  place?: string | null;
  twoMinute?: string | null;
}

export async function createTask(ctx: Ctx, d: TaskDraft): Promise<PlanTaskRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>(
    'SELECT MAX(display_order) AS m FROM plan_tasks WHERE deleted_at IS NULL AND local_date = ?',
    [d.localDate],
  );
  return writeLocal(ctx, 'planTasks', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    title: d.title,
    localDate: d.localDate,
    identityId: d.identityId ?? null,
    goalId: d.goalId ?? null,
    localTime: d.localTime ?? null,
    place: d.place ?? null,
    twoMinute: d.twoMinute ?? null,
    completedAt: null,
    displayOrder: (max?.m ?? -1) + 1,
  });
}

export async function updateTask(ctx: Ctx, id: string, patch: Partial<TaskDraft>): Promise<PlanTaskRecord> {
  const cur = await current(ctx, 'planTasks', id);
  return writeLocal(ctx, 'planTasks', { ...cur, ...patch, updatedAt: editTime(ctx, cur) });
}

export async function toggleTask(ctx: Ctx, id: string): Promise<PlanTaskRecord> {
  const cur = await current(ctx, 'planTasks', id);
  const t = editTime(ctx, cur);
  return writeLocal(ctx, 'planTasks', { ...cur, completedAt: cur.completedAt ? null : t, updatedAt: t });
}

export async function deleteTask(ctx: Ctx, id: string): Promise<void> {
  const cur = await current(ctx, 'planTasks', id);
  const t = editTime(ctx, cur);
  await writeLocal(ctx, 'planTasks', { ...cur, deletedAt: t, updatedAt: t });
}

/**
 * "Never miss twice": yesterday's unfinished tasks, so today can get back on track.
 * Tasks already carried over (an open copy exists today) are left out.
 */
export async function missedYesterday(ctx: Ctx, today: string): Promise<PlanTaskRecord[]> {
  const [yesterday, todays] = await Promise.all([tasksForDate(ctx, addDays(today, -1)), tasksForDate(ctx, today)]);
  const today_ = new Set(todays.map((t) => t.title.trim().toLowerCase()));
  return yesterday.filter((t) => !t.completedAt && !today_.has(t.title.trim().toLowerCase()));
}

/** Copies a missed task to `today` as a fresh, unfinished task (the original stays as missed). */
export function carryOver(ctx: Ctx, task: PlanTaskRecord, today: string, opts: { twoMinuteOnly?: boolean } = {}) {
  const title = opts.twoMinuteOnly && task.twoMinute ? task.twoMinute : task.title;
  return createTask(ctx, {
    title,
    localDate: today,
    identityId: task.identityId,
    goalId: task.goalId,
    localTime: task.localTime,
    place: task.place,
    twoMinute: opts.twoMinuteOnly ? null : task.twoMinute,
  });
}

// ------------------------------------------------------------------ reviews

export async function getReview(ctx: Ctx, level: PlanLevel, periodStart: string): Promise<PlanReviewRecord | undefined> {
  const row = await getLocal(ctx.db, 'planReviews', planReviewId(ctx.userId, level, periodStart));
  return row && !row.record.deletedAt ? row.record : undefined;
}

export type ReviewFields = Pick<PlanReviewRecord, 'wentWell' | 'makeEasier' | 'onePercent'>;

export async function saveReview(ctx: Ctx, level: PlanLevel, periodStart: string, fields: ReviewFields) {
  const id = planReviewId(ctx.userId, level, periodStart);
  const existing = await getLocal(ctx.db, 'planReviews', id);
  const t = editTime(ctx, existing?.record);
  return writeLocal(ctx, 'planReviews', {
    id,
    createdAt: existing?.record.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
    level,
    periodStart,
    ...fields,
  });
}

// ------------------------------------------------------------------ summaries

export interface IdentityVotes {
  identity: IdentityRecord;
  votes: number;
  /** Tasks planned for this identity in the range (done or not). */
  planned: number;
}

/** Completed tasks per identity: each is a vote for the person the user is becoming. */
export async function identityVotes(ctx: Ctx, from: string, to: string): Promise<IdentityVotes[]> {
  const [identities, tasks] = await Promise.all([listIdentities(ctx, { includeArchived: true }), tasksInRange(ctx, from, to)]);
  return identities
    .map((identity) => {
      const mine = tasks.filter((t) => t.identityId === identity.id);
      return { identity, votes: mine.filter((t) => t.completedAt).length, planned: mine.length };
    })
    .filter((v) => v.identity.isActive || v.planned > 0)
    .sort((a, b) => b.votes - a.votes || a.identity.displayOrder - b.identity.displayOrder);
}

export interface DayPlan {
  localDate: string;
  tasks: PlanTaskRecord[];
  done: number;
}

export interface GoalProgress {
  goal: PlanGoalRecord;
  /** Tasks linked to this goal (weekly), or to its weekly goals (monthly). */
  tasks: number;
  done: number;
  children: PlanGoalRecord[];
}

export interface PeriodPlan {
  level: PlanLevel;
  periodStart: string;
  periodEnd: string;
  goals: GoalProgress[];
  days: DayPlan[];
  votes: IdentityVotes[];
  review: PlanReviewRecord | undefined;
  totals: { tasks: number; done: number };
}

export async function loadPeriod(ctx: Ctx, level: PlanLevel, periodStart: string): Promise<PeriodPlan> {
  const end = periodEnd(level, periodStart);
  const [goals, tasks, votes, review, weekGoalsInMonth] = await Promise.all([
    listGoals(ctx, level, periodStart),
    tasksInRange(ctx, periodStart, end),
    identityVotes(ctx, periodStart, end),
    getReview(ctx, level, periodStart),
    level === 'month'
      ? listLocal(ctx.db, 'planGoals', {
          where: "level = 'week' AND period_start BETWEEN ? AND ?",
          params: [addDays(periodStart, -6), end],
          orderBy: 'period_start, display_order',
        })
      : Promise.resolve([] as PlanGoalRecord[]),
  ]);
  const progress = (goalIds: Set<string>) => {
    const linked = tasks.filter((t) => t.goalId && goalIds.has(t.goalId));
    return { tasks: linked.length, done: linked.filter((t) => t.completedAt).length };
  };
  return {
    level,
    periodStart,
    periodEnd: end,
    goals: goals.map((goal) => {
      const children = weekGoalsInMonth.filter((w) => w.parentId === goal.id);
      return { goal, children, ...progress(new Set(level === 'week' ? [goal.id] : children.map((c) => c.id))) };
    }),
    days: dateRange(periodStart, end).map((localDate) => {
      const mine = tasks.filter((t) => t.localDate === localDate);
      return { localDate, tasks: mine, done: mine.filter((t) => t.completedAt).length };
    }),
    votes,
    review,
    totals: { tasks: tasks.length, done: tasks.filter((t) => t.completedAt).length },
  };
}

/** Weekly goals for the week containing `localDate`, to link a task to. */
export const weekGoalsFor = (ctx: Ctx, localDate: string) => listGoals(ctx, 'week', weekStartOf(localDate));
