import { seriesInstanceId } from '@journal/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx } from '../test/ctx';
import { blocksInRange } from './blocks';
import { tasksInRange, toggleTask } from './planner';
import { getLocal } from './records';
import { createSeries, deleteOccurrence, editOccurrence, ensureOccurrences, listSeries } from './series';

let ctx: ReturnType<typeof makeCtx>;
beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

const block = { title: 'Gym', startTime: '07:00', endTime: '08:00', color: 'sage' as const, identityId: null };
const titles = (xs: { localDate: string }[]) => xs.map((x) => x.localDate);

describe('repeating blocks and tasks', () => {
  it('creates daily, weekly and custom occurrences with stable ids', async () => {
    const daily = await createSeries(ctx, 'block', '2026-10-05', block, { frequency: 'daily', days: [], endDate: null });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-11', '2026-10-05');
    expect(titles(await blocksInRange(ctx, '2026-10-05', '2026-10-11'))).toHaveLength(7);
    const b = (await blocksInRange(ctx, '2026-10-07', '2026-10-07'))[0]!;
    expect(b.id).toBe(seriesInstanceId(ctx.userId, daily.id, '2026-10-07'));
    expect(b).toMatchObject({ seriesId: daily.id, startTime: '07:00:00' });

    await createSeries(ctx, 'task', '2026-10-05', { ...block, title: 'Review week', color: null, endTime: null }, { frequency: 'weekly', days: [1], endDate: null });
    await createSeries(ctx, 'task', '2026-10-05', { ...block, title: 'Run', color: null, endTime: null }, { frequency: 'custom', days: [2, 4, 6], endDate: '2026-10-17' });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-25', '2026-10-05');
    const tasks = await tasksInRange(ctx, '2026-10-05', '2026-10-25');
    expect(titles(tasks.filter((t) => t.title === 'Review week'))).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(titles(tasks.filter((t) => t.title === 'Run'))).toEqual(['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13', '2026-10-15', '2026-10-17']);
  });

  it('ticks each day separately, and does not recreate a deleted occurrence', async () => {
    const s = await createSeries(ctx, 'task', '2026-10-05', { ...block, title: 'Read', color: null, endTime: null }, { frequency: 'daily', days: [], endDate: null });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-07', '2026-10-05');
    const [mon, tue] = await tasksInRange(ctx, '2026-10-05', '2026-10-06');
    await toggleTask(ctx, mon!.id);
    await deleteOccurrence(ctx, tue!, 'task', 'one');
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-07', '2026-10-05');
    const after = await tasksInRange(ctx, '2026-10-05', '2026-10-07');
    expect(after.map((t) => [t.localDate, !!t.completedAt])).toEqual([
      ['2026-10-05', true],
      ['2026-10-07', false],
    ]);
    expect((await getLocal(ctx.db, 'planTasks', seriesInstanceId(ctx.userId, s.id, '2026-10-06')))?.record.deletedAt).not.toBeNull();
  });

  it('deletes this and following: the series ends the day before, finished tasks stay', async () => {
    const s = await createSeries(ctx, 'block', '2026-10-05', block, { frequency: 'daily', days: [], endDate: null });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-11', '2026-10-05');
    const thu = (await blocksInRange(ctx, '2026-10-08', '2026-10-08'))[0]!;
    await deleteOccurrence(ctx, thu, 'block', 'following');
    expect((await listSeries(ctx))[0]).toMatchObject({ id: s.id, endDate: '2026-10-07' });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-20', '2026-10-05');
    expect(titles(await blocksInRange(ctx, '2026-10-05', '2026-10-20'))).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('edits one day only, or this and following (a new series takes over)', async () => {
    await createSeries(ctx, 'block', '2026-10-05', block, { frequency: 'daily', days: [], endDate: null });
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-11', '2026-10-05');
    const tue = (await blocksInRange(ctx, '2026-10-06', '2026-10-06'))[0]!;
    await editOccurrence(ctx, 'block', tue, { date: '2026-10-06', fields: { ...block, startTime: '09:00', endTime: '10:00' }, repeat: null }, 'one');
    expect((await blocksInRange(ctx, '2026-10-05', '2026-10-07')).map((b) => b.startTime)).toEqual(['07:00:00', '09:00:00', '07:00:00']);

    const thu = (await blocksInRange(ctx, '2026-10-08', '2026-10-08'))[0]!;
    await editOccurrence(
      ctx,
      'block',
      thu,
      { date: '2026-10-08', fields: { ...block, title: 'Swim', startTime: '18:00', endTime: '19:00' }, repeat: { frequency: 'custom', days: [4, 6], endDate: null } },
      'following',
    );
    await ensureOccurrences(ctx, '2026-10-05', '2026-10-17', '2026-10-05');
    const all = await blocksInRange(ctx, '2026-10-05', '2026-10-17');
    expect(all.map((b) => `${b.localDate} ${b.title}`)).toEqual([
      '2026-10-05 Gym',
      '2026-10-06 Gym',
      '2026-10-07 Gym',
      '2026-10-08 Swim',
      '2026-10-10 Swim',
      '2026-10-15 Swim',
      '2026-10-17 Swim',
    ]);
    expect(await listSeries(ctx)).toHaveLength(2);
  });
});
