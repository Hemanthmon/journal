import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import { blocksInRange, createBlock, deleteBlock, timelineFor, updateBlock } from './blocks';
import { createTask } from './planner';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

describe('time blocks', () => {
  it('creates, edits and deletes blocks offline, queued for sync', async () => {
    const b = await createBlock(ctx, { title: 'Deep work', localDate: '2026-10-08', startTime: '09:00', endTime: '11:00', color: 'sage' });
    expect(b.startTime).toBe('09:00:00');
    expect(await outboxCount(ctx.db)).toBe(1);
    ctx.advance(1000);
    await updateBlock(ctx, b.id, { endTime: '11:30', color: 'sky' });
    expect((await blocksInRange(ctx, '2026-10-08', '2026-10-08'))[0]).toMatchObject({ endTime: '11:30:00', color: 'sky' });
    await deleteBlock(ctx, b.id);
    expect(await blocksInRange(ctx, '2026-10-08', '2026-10-08')).toEqual([]);
  });

  it('rejects a block that ends before it starts', async () => {
    await expect(
      createBlock(ctx, { title: 'Oops', localDate: '2026-10-08', startTime: '11:00', endTime: '10:00', color: 'sage' }),
    ).rejects.toThrow(/end after it starts/);
  });

  it('puts blocks and timed tasks on one timeline, side by side when they overlap', async () => {
    await createBlock(ctx, { title: 'Deep work', localDate: '2026-10-08', startTime: '09:00', endTime: '11:00', color: 'sage' });
    await createBlock(ctx, { title: 'Lunch', localDate: '2026-10-08', startTime: '12:00', endTime: '13:00', color: 'peach' });
    await createTask(ctx, { title: 'Call mum', localDate: '2026-10-08', localTime: '10:00' });
    await createTask(ctx, { title: 'No time', localDate: '2026-10-08' });

    const items = await timelineFor(ctx, '2026-10-08');
    const byTitle = Object.fromEntries(
      items.map((p) => [p.item.kind === 'block' ? p.item.block.title : p.item.task.title, p]),
    );
    expect(Object.keys(byTitle).sort()).toEqual(['Call mum', 'Deep work', 'Lunch']);
    expect(byTitle['Deep work']).toMatchObject({ column: 0, columns: 2 });
    expect(byTitle['Call mum']).toMatchObject({ column: 1, columns: 2 });
    expect(byTitle['Call mum']!.item).toMatchObject({ start: 600, end: 630 });
    expect(byTitle['Lunch']).toMatchObject({ column: 0, columns: 1 });
  });
});
