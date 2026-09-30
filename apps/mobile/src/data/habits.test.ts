import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import { createHabit, deleteHabit, habitsForDate, listHabits, reorderHabits, setHabitValue, updateHabit } from './habits';
import { getLocal } from './records';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

describe('habit creation and editing (offline)', () => {
  it('creates habits of every measurement type, saved locally and queued for sync', async () => {
    const meditation = await createHabit(ctx, { name: 'Meditation', measurementType: 'duration', targetValue: 10 });
    const reading = await createHabit(ctx, {
      name: 'Reading',
      measurementType: 'count',
      targetValue: 10,
      unit: 'pages',
      scheduleDays: [1, 2, 3, 4, 5],
    });
    await createHabit(ctx, { name: 'Drink water', measurementType: 'quantity', targetValue: 2, unit: 'litres' });
    const wake = await createHabit(ctx, { name: 'Wake up early', measurementType: 'boolean' });

    expect(meditation).toMatchObject({ unit: 'minutes', scheduleDays: [1, 2, 3, 4, 5, 6, 7], displayOrder: 0 });
    expect(reading.displayOrder).toBe(1);
    expect(wake).toMatchObject({ targetValue: 1, unit: null });
    expect((await listHabits(ctx)).map((h) => h.name)).toEqual(['Meditation', 'Reading', 'Drink water', 'Wake up early']);

    const row = await getLocal(ctx.db, 'habits', meditation.id);
    expect(row?.syncStatus).toBe('pending');
    expect(await outboxCount(ctx.db)).toBe(4);
  });

  it('rejects invalid habits without saving anything', async () => {
    await expect(createHabit(ctx, { name: '', measurementType: 'count', targetValue: 5 })).rejects.toBeInstanceOf(ZodError);
    await expect(createHabit(ctx, { name: 'Water', measurementType: 'quantity', targetValue: 2 })).rejects.toThrow(/unit/);
    await expect(
      createHabit(ctx, { name: 'Run', measurementType: 'duration', targetValue: 30, scheduleDays: [] }),
    ).rejects.toThrow(/at least one day/);
    expect(await listHabits(ctx)).toHaveLength(0);
    expect(await outboxCount(ctx.db)).toBe(0);
  });

  it('edits, archives, reorders and deletes; repeated edits upload once', async () => {
    const a = await createHabit(ctx, { name: 'A', measurementType: 'boolean' });
    const b = await createHabit(ctx, { name: 'B', measurementType: 'boolean' });
    ctx.advance(1000);
    await updateHabit(ctx, a.id, { name: 'A2' });
    await updateHabit(ctx, a.id, { archived: true });
    await reorderHabits(ctx, [b.id, a.id]);
    expect((await listHabits(ctx)).map((h) => [h.name, h.displayOrder, !!h.archivedAt])).toEqual([
      ['B', 0, false],
      ['A2', 1, true],
    ]);
    expect(await outboxCount(ctx.db)).toBe(2);

    await deleteHabit(ctx, b.id);
    expect((await listHabits(ctx)).map((h) => h.name)).toEqual(['A2']);
  });
});

describe('habit measurements', () => {
  it('keeps partial progress and computes capped percentages', async () => {
    const exercise = await createHabit(ctx, { name: 'Exercise', measurementType: 'duration', targetValue: 30 });
    await setHabitValue(ctx, exercise, '2026-09-29', 15);
    let [day] = await habitsForDate(ctx, '2026-09-29');
    expect(day).toMatchObject({ value: 15, target: 30, progress: 50 });

    await setHabitValue(ctx, exercise, '2026-09-29', 45);
    [day] = await habitsForDate(ctx, '2026-09-29');
    expect(day).toMatchObject({ value: 45, progress: 100 });
  });

  it('stores boolean habits as 0/1 and quantities with two decimals', async () => {
    const wake = await createHabit(ctx, { name: 'Wake', measurementType: 'boolean' });
    const water = await createHabit(ctx, { name: 'Water', measurementType: 'quantity', targetValue: 2, unit: 'l' });
    expect((await setHabitValue(ctx, wake, '2026-09-29', 5)).value).toBe(1);
    expect((await setHabitValue(ctx, water, '2026-09-29', 1.2345)).value).toBe(1.23);
    expect((await setHabitValue(ctx, water, '2026-09-29', -3)).value).toBe(0);
  });

  it('keeps the target snapshot when the habit target changes later', async () => {
    const read = await createHabit(ctx, { name: 'Read', measurementType: 'count', targetValue: 10, unit: 'pages' });
    await setHabitValue(ctx, read, '2026-09-29', 5);
    await updateHabit(ctx, read.id, { targetValue: 20 });
    const [day] = await habitsForDate(ctx, '2026-09-29');
    expect(day).toMatchObject({ target: 10, progress: 50 });
  });

  it('only shows habits on their scheduled days, and never before they existed', async () => {
    const monSat = await createHabit(ctx, {
      name: 'Exercise',
      measurementType: 'duration',
      targetValue: 30,
      scheduleDays: [1, 2, 3, 4, 5, 6],
    });
    const disabled = await createHabit(ctx, { name: 'Off', measurementType: 'boolean', isActive: false });
    expect((await habitsForDate(ctx, '2026-10-03')).map((h) => h.habit.name)).toEqual(['Exercise']); // Saturday
    expect(await habitsForDate(ctx, '2026-10-04')).toHaveLength(0); // Sunday: not scheduled, not missed
    expect(await habitsForDate(ctx, '2026-09-01')).toHaveLength(0); // before it was created

    // A logged day still shows the habit after it's archived.
    await setHabitValue(ctx, monSat, '2026-09-29', 30);
    await updateHabit(ctx, monSat.id, { archived: true });
    expect((await habitsForDate(ctx, '2026-09-29')).map((h) => h.habit.name)).toEqual(['Exercise']);
    expect(await habitsForDate(ctx, '2026-09-30')).toHaveLength(0);
    expect(disabled.isActive).toBe(false);
  });
});
