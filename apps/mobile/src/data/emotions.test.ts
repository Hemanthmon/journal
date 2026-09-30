import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EMOTIONS, defaultEmotionId } from '@journal/shared';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import { addEmotion, listEmotions, removeEmotion, reorderEmotions } from './emotions';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

describe('custom emotion list', () => {
  it('starts with the default emotions, created once with device-independent ids', async () => {
    const first = await listEmotions(ctx);
    expect(first.map((e) => e.name)).toEqual([...DEFAULT_EMOTIONS]);
    expect(first[0]!.id).toBe(defaultEmotionId(ctx.userId, 'Bored'));
    await listEmotions(ctx);
    expect(await outboxCount(ctx.db)).toBe(DEFAULT_EMOTIONS.length);
  });

  it('adds, removes and reorders emotions', async () => {
    await addEmotion(ctx, '  Homesick ');
    let list = await listEmotions(ctx);
    expect(list.at(-1)!.name).toBe('Homesick');

    const bored = list.find((e) => e.name === 'Bored')!;
    await removeEmotion(ctx, bored.id);
    list = await listEmotions(ctx);
    expect(list.map((e) => e.name)).not.toContain('Bored');
    // Removing a default doesn't bring the defaults back.
    expect(list).toHaveLength(DEFAULT_EMOTIONS.length);

    const homesick = list.find((e) => e.name === 'Homesick')!;
    await reorderEmotions(ctx, [homesick.id, ...list.filter((e) => e.id !== homesick.id).map((e) => e.id)]);
    expect((await listEmotions(ctx))[0]!.name).toBe('Homesick');
  });

  it('rejects duplicates, commas and empty names', async () => {
    await expect(addEmotion(ctx, 'bored')).rejects.toThrow(/already in your list/);
    await expect(addEmotion(ctx, 'Sad, tired')).rejects.toThrow(/one emotion at a time/);
    await expect(addEmotion(ctx, '  ')).rejects.toThrow(/Enter an emotion/);
  });
});
