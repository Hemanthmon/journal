import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx } from '../test/ctx';
import { createUrge, trackingStart, urgeFreeStreak } from './urges';

let ctx: ReturnType<typeof makeCtx>;
beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

const urge = (localDate: string) => createUrge(ctx, { localDate, localTime: '20:00', intensity: 5 });

describe('urge-free streak', () => {
  it('is zero before anything is tracked', async () => {
    expect(await trackingStart(ctx)).toBeNull();
    expect(await urgeFreeStreak(ctx, '2026-10-13')).toBe(0);
  });

  it('counts urge-free days since the last urge, including today', async () => {
    await urge('2026-10-05');
    await urge('2026-10-10');
    expect(await trackingStart(ctx)).toBe('2026-10-05');
    expect(await urgeFreeStreak(ctx, '2026-10-13')).toBe(3); // 11, 12, 13
  });

  it('is zero on a day with an urge', async () => {
    await urge('2026-10-13');
    expect(await urgeFreeStreak(ctx, '2026-10-13')).toBe(0);
  });

  it('ignores urges in the future of the day asked about', async () => {
    await urge('2026-10-01');
    await urge('2026-10-20');
    expect(await urgeFreeStreak(ctx, '2026-10-13')).toBe(12); // 2nd..13th
  });
});
