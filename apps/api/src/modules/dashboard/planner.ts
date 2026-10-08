import type { RowDataPacket } from 'mysql2/promise';
import {
  ENTITIES,
  addDays,
  dateRange,
  monthStartOf,
  periodEnd,
  weekStartOf,
  weekdayName,
  weekdayOf,
  type DashboardPlanner,
  type EntityName,
  type EntityRecordMap,
  type IdentityRecord,
  type PlanGoalRecord,
  type PlanReviewRecord,
  type PlanTaskRecord,
  type PlannerGoal,
} from '@journal/shared';
import { getPool } from '../../db/pool';
import { rowToRecord } from '../../records/records';

type Row = RowDataPacket & Record<string, unknown>;

async function load<E extends EntityName>(entity: E, userId: string): Promise<EntityRecordMap[E][]> {
  const def = ENTITIES[entity];
  const [rows] = await getPool().query<Row[]>(
    `SELECT server_seq, ${def.fields.map((f) => f.col).join(', ')} FROM ${def.table} WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return rows.map((r) => rowToRecord(entity, r) as unknown as EntityRecordMap[E]);
}

export interface PlannerData {
  identities: IdentityRecord[];
  goals: PlanGoalRecord[];
  tasks: PlanTaskRecord[];
  reviews: PlanReviewRecord[];
}

export async function loadPlannerData(ownerUserId: string): Promise<PlannerData> {
  const [identities, goals, tasks, reviews] = await Promise.all([
    load('identities', ownerUserId),
    load('planGoals', ownerUserId),
    load('planTasks', ownerUserId),
    load('planReviews', ownerUserId),
  ]);
  return { identities, goals, tasks, reviews };
}

const byOrder = <T extends { displayOrder: number; createdAt: string }>(a: T, b: T) =>
  a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt);

/** The owner's planner for the week containing `date` (and that week's month). Pure. */
export function buildPlanner(data: PlannerData, today: string, date: string): DashboardPlanner {
  const weekStart = weekStartOf(date);
  const weekEnd = addDays(weekStart, 6);
  // The month most of the week falls in.
  const monthStart = monthStartOf(addDays(weekStart, 3));
  const monthEnd = periodEnd('month', monthStart);

  const identityName = new Map(data.identities.map((i) => [i.id, i.statement]));
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  const inRange = (t: PlanTaskRecord, from: string, to: string) => t.localDate >= from && t.localDate <= to;
  const count = (tasks: PlanTaskRecord[]) => ({ tasks: tasks.length, tasksDone: tasks.filter((t) => t.completedAt).length });
  const name = (id: string | null) => (id ? (identityName.get(id) ?? null) : null);

  const weekTasks = data.tasks.filter((t) => inRange(t, weekStart, weekEnd));
  const monthTasks = data.tasks.filter((t) => inRange(t, monthStart, monthEnd));

  const weekGoals: PlannerGoal[] = data.goals
    .filter((g) => g.level === 'week' && g.periodStart === weekStart)
    .sort(byOrder)
    .map((g) => ({
      text: g.text,
      done: !!g.doneAt,
      identity: name(g.identityId),
      focus: g.parentId ? (goalById.get(g.parentId)?.text ?? null) : null,
      weeklyGoals: [],
      ...count(weekTasks.filter((t) => t.goalId === g.id)),
    }));

  const focuses: PlannerGoal[] = data.goals
    .filter((g) => g.level === 'month' && g.periodStart === monthStart)
    .sort(byOrder)
    .map((g) => {
      const children = data.goals.filter((w) => w.level === 'week' && w.parentId === g.id).sort((a, b) => a.periodStart.localeCompare(b.periodStart) || byOrder(a, b));
      const childIds = new Set(children.map((c) => c.id));
      return {
        text: g.text,
        done: !!g.doneAt,
        identity: name(g.identityId),
        focus: null,
        weeklyGoals: children.map((c) => ({ text: c.text, done: !!c.doneAt })),
        ...count(data.tasks.filter((t) => t.goalId && childIds.has(t.goalId))),
      };
    });

  const sortTasks = (a: PlanTaskRecord, b: PlanTaskRecord) =>
    (a.localTime === null ? 1 : 0) - (b.localTime === null ? 1 : 0) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || byOrder(a, b);

  const votes = (identityId: string, tasks: PlanTaskRecord[]) => tasks.filter((t) => t.identityId === identityId && t.completedAt).length;
  const identities = data.identities
    .map((i) => ({
      id: i.id,
      statement: i.statement,
      active: i.isActive,
      weekVotes: votes(i.id, weekTasks),
      monthVotes: votes(i.id, monthTasks),
      totalVotes: votes(i.id, data.tasks),
      order: i.displayOrder,
    }))
    .filter((i) => i.active || i.totalVotes > 0)
    .sort((a, b) => b.weekVotes - a.weekVotes || b.totalVotes - a.totalVotes || a.order - b.order)
    .map(({ order: _o, ...i }) => i);

  const yesterday = addDays(today, -1);
  const todaysTitles = new Set(data.tasks.filter((t) => t.localDate === today).map((t) => t.title.trim().toLowerCase()));
  const missedYesterday =
    weekStartOf(today) === weekStart
      ? data.tasks
          .filter((t) => t.localDate === yesterday && !t.completedAt && !todaysTitles.has(t.title.trim().toLowerCase()))
          .map((t) => t.title)
      : [];

  return {
    today,
    week: { start: weekStart, end: weekEnd, goals: weekGoals, ...count(weekTasks) },
    month: { start: monthStart, end: monthEnd, focuses, ...count(monthTasks) },
    days: dateRange(weekStart, weekEnd).map((d) => ({
      date: d,
      weekday: weekdayName(weekdayOf(d), 'long'),
      tasks: weekTasks
        .filter((t) => t.localDate === d)
        .sort(sortTasks)
        .map((t) => ({
          title: t.title,
          done: !!t.completedAt,
          time: t.localTime ? t.localTime.slice(0, 5) : null,
          place: t.place,
          twoMinute: t.twoMinute,
          identity: name(t.identityId),
        })),
    })),
    identities,
    missedYesterday,
    reviews: data.reviews
      .filter((r) => r.wentWell || r.makeEasier || r.onePercent)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || (a.level === 'month' ? -1 : 1))
      .slice(0, 8)
      .map((r) => ({ level: r.level, periodStart: r.periodStart, wentWell: r.wentWell, makeEasier: r.makeEasier, onePercent: r.onePercent })),
  };
}
