import { planReviewId } from '@journal/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import {
  carryOver,
  createGoal,
  createIdentity,
  createTask,
  deleteIdentity,
  getReview,
  identityVotes,
  loadPeriod,
  missedYesterday,
  monthStartOf,
  periodEnd,
  saveReview,
  shiftPeriod,
  tasksForDate,
  toggleGoalDone,
  toggleTask,
  updateIdentity,
  weekStartOf,
} from './planner';
import { getLocal } from './records';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

describe('planner periods', () => {
  it('finds the Monday of the week and the first of the month', () => {
    expect(weekStartOf('2026-10-08')).toBe('2026-10-05'); // Thursday
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(monthStartOf('2026-10-08')).toBe('2026-10-01');
  });

  it('computes period ends and moves between periods', () => {
    expect(periodEnd('week', '2026-10-05')).toBe('2026-10-11');
    expect(periodEnd('month', '2026-02-01')).toBe('2026-02-28');
    expect(periodEnd('month', '2026-12-01')).toBe('2026-12-31');
    expect(shiftPeriod('month', '2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftPeriod('month', '2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftPeriod('week', '2026-10-05', -1)).toBe('2026-09-28');
  });
});

describe('planner', () => {
  it('saves identities, goals and tasks offline, queued for sync', async () => {
    const reader = await createIdentity(ctx, 'I am a reader');
    const focus = await createGoal(ctx, { level: 'month', periodStart: '2026-10-01', text: 'Finish two books', identityId: reader.id });
    const weekly = await createGoal(ctx, { level: 'week', periodStart: '2026-10-05', text: 'Read 100 pages', parentId: focus.id });
    const task = await createTask(ctx, {
      title: 'Read 20 pages',
      localDate: '2026-10-08',
      identityId: reader.id,
      goalId: weekly.id,
      localTime: '07:00',
      place: 'Bedroom chair',
      twoMinute: 'Open the book',
    });
    expect(task.localTime).toBe('07:00:00');
    expect((await getLocal(ctx.db, 'planTasks', task.id))?.syncStatus).toBe('pending');
    expect(await outboxCount(ctx.db)).toBe(4);
  });

  it('rejects goals whose period does not start on a Monday / the 1st', async () => {
    await expect(createGoal(ctx, { level: 'week', periodStart: '2026-10-08', text: 'x' })).rejects.toThrow(/Monday/);
    await expect(createGoal(ctx, { level: 'month', periodStart: '2026-10-02', text: 'x' })).rejects.toThrow(/day 1/);
  });

  it('counts completed tasks as votes for each identity', async () => {
    const reader = await createIdentity(ctx, 'I am a reader');
    const athlete = await createIdentity(ctx, 'I am an athlete');
    const a = await createTask(ctx, { title: 'Read', localDate: '2026-10-06', identityId: reader.id });
    const b = await createTask(ctx, { title: 'Read', localDate: '2026-10-07', identityId: reader.id });
    await createTask(ctx, { title: 'Run', localDate: '2026-10-07', identityId: athlete.id });
    await toggleTask(ctx, a.id);
    await toggleTask(ctx, b.id);

    const votes = await identityVotes(ctx, '2026-10-05', '2026-10-11');
    expect(votes.map((v) => [v.identity.statement, v.votes, v.planned])).toEqual([
      ['I am a reader', 2, 2],
      ['I am an athlete', 0, 1],
    ]);

    // Unticking takes the vote back.
    await toggleTask(ctx, b.id);
    expect((await identityVotes(ctx, '2026-10-05', '2026-10-11'))[0]!.votes).toBe(1);

    // An archived identity with no tasks in the range disappears; with tasks it stays.
    await updateIdentity(ctx, athlete.id, { isActive: false });
    expect((await identityVotes(ctx, '2026-10-05', '2026-10-11')).map((v) => v.identity.statement)).toContain('I am an athlete');
    expect((await identityVotes(ctx, '2026-11-02', '2026-11-08')).map((v) => v.identity.statement)).toEqual(['I am a reader']);
  });

  it("never misses twice: offers yesterday's unfinished tasks, and the 2-minute version", async () => {
    const t = await createTask(ctx, { title: 'Read 20 pages', localDate: '2026-10-07', twoMinute: 'Open the book' });
    await createTask(ctx, { title: 'Done already', localDate: '2026-10-07' }).then((x) => toggleTask(ctx, x.id));
    expect((await missedYesterday(ctx, '2026-10-08')).map((m) => m.title)).toEqual(['Read 20 pages']);

    await carryOver(ctx, t, '2026-10-08', { twoMinuteOnly: true });
    expect((await tasksForDate(ctx, '2026-10-08')).map((x) => x.title)).toEqual(['Open the book']);
    // Yesterday's task is kept as missed, not moved.
    expect((await tasksForDate(ctx, '2026-10-07')).map((x) => x.title)).toContain('Read 20 pages');

    await carryOver(ctx, t, '2026-10-08');
    expect(await missedYesterday(ctx, '2026-10-08')).toEqual([]);
  });

  it('summarises a week: goals with linked-task progress, days and totals', async () => {
    const weekly = await createGoal(ctx, { level: 'week', periodStart: '2026-10-05', text: 'Read 100 pages' });
    const t1 = await createTask(ctx, { title: 'Read', localDate: '2026-10-05', goalId: weekly.id });
    await createTask(ctx, { title: 'Read', localDate: '2026-10-06', goalId: weekly.id });
    await createTask(ctx, { title: 'Unrelated', localDate: '2026-10-06' });
    await createTask(ctx, { title: 'Next week', localDate: '2026-10-12' });
    await toggleTask(ctx, t1.id);
    await toggleGoalDone(ctx, weekly.id);

    const week = await loadPeriod(ctx, 'week', '2026-10-05');
    expect(week.periodEnd).toBe('2026-10-11');
    expect(week.days).toHaveLength(7);
    expect(week.totals).toEqual({ tasks: 3, done: 1 });
    expect(week.goals[0]).toMatchObject({ tasks: 2, done: 1 });
    expect(week.goals[0]!.goal.doneAt).not.toBeNull();
  });

  it('summarises a month through its weekly goals', async () => {
    const focus = await createGoal(ctx, { level: 'month', periodStart: '2026-10-01', text: 'Finish two books' });
    // The week of Sep 28 overlaps October.
    const w1 = await createGoal(ctx, { level: 'week', periodStart: '2026-09-28', text: 'Book one', parentId: focus.id });
    const w2 = await createGoal(ctx, { level: 'week', periodStart: '2026-10-05', text: 'Book two', parentId: focus.id });
    const t = await createTask(ctx, { title: 'Read', localDate: '2026-10-02', goalId: w1.id });
    await createTask(ctx, { title: 'Read', localDate: '2026-10-06', goalId: w2.id });
    await toggleTask(ctx, t.id);

    const month = await loadPeriod(ctx, 'month', '2026-10-01');
    expect(month.days).toHaveLength(31);
    expect(month.goals[0]!.children.map((c) => c.text)).toEqual(['Book one', 'Book two']);
    expect(month.goals[0]).toMatchObject({ tasks: 2, done: 1 });
  });

  it('keeps one review per week, editable', async () => {
    await saveReview(ctx, 'week', '2026-10-05', { wentWell: 'Read daily', makeEasier: null, onePercent: 'Phone away' });
    ctx.advance(1000);
    await saveReview(ctx, 'week', '2026-10-05', { wentWell: 'Read 6 of 7 days', makeEasier: 'Book on pillow', onePercent: 'Phone away' });
    const r = await getReview(ctx, 'week', '2026-10-05');
    expect(r).toMatchObject({ id: planReviewId(ctx.userId, 'week', '2026-10-05'), wentWell: 'Read 6 of 7 days', makeEasier: 'Book on pillow' });
    expect(await getReview(ctx, 'month', '2026-10-01')).toBeUndefined();
  });

  it('leaves tasks in place when their identity is deleted', async () => {
    const reader = await createIdentity(ctx, 'I am a reader');
    await createTask(ctx, { title: 'Read', localDate: '2026-10-06', identityId: reader.id });
    await deleteIdentity(ctx, reader.id);
    expect(await tasksForDate(ctx, '2026-10-06')).toHaveLength(1);
    expect(await identityVotes(ctx, '2026-10-05', '2026-10-11')).toEqual([]);
  });
});
