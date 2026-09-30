import { DEFAULT_EMOTIONS, defaultEmotionId, type EmotionOptionRecord } from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

/**
 * The user's own emotion chips for the urge form.
 *
 * The default list is created the first time it's needed, with deterministic ids so
 * several devices create the same records (sync merges them). Removing a default is a
 * sticky delete on the server, so it won't reappear from another device.
 */
async function ensureDefaults(ctx: Ctx): Promise<void> {
  const any = await ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM emotion_options');
  if ((any?.n ?? 0) > 0) return;
  const now = ctx.now().toISOString();
  await ctx.db.transaction(async (tx) => {
    for (const [i, name] of DEFAULT_EMOTIONS.entries()) {
      await writeLocal(
        ctx,
        'emotionOptions',
        { id: defaultEmotionId(ctx.userId, name), createdAt: now, updatedAt: now, deletedAt: null, name, displayOrder: i },
        { tx },
      );
    }
  });
}

/** Current emotion chips, in display order. */
export async function listEmotions(ctx: Ctx): Promise<EmotionOptionRecord[]> {
  await ensureDefaults(ctx);
  return listLocal(ctx.db, 'emotionOptions', { orderBy: 'display_order, created_at' });
}

export async function addEmotion(ctx: Ctx, name: string): Promise<EmotionOptionRecord> {
  const clean = name.trim();
  if (clean.includes(',')) throw new Error('Add one emotion at a time (no commas)');
  const current = await listEmotions(ctx);
  if (current.some((e) => e.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`"${clean}" is already in your list`);
  }
  const now = ctx.now().toISOString();
  return writeLocal(ctx, 'emotionOptions', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: clean,
    displayOrder: current.reduce((m, e) => Math.max(m, e.displayOrder), -1) + 1,
  });
}

/** Removes a chip. Past urge records keep the emotion text they were saved with. */
export async function removeEmotion(ctx: Ctx, id: string): Promise<void> {
  const row = await getLocal(ctx.db, 'emotionOptions', id);
  if (!row || row.record.deletedAt) return;
  const t = editTime(ctx, row.record);
  await writeLocal(ctx, 'emotionOptions', { ...row.record, deletedAt: t, updatedAt: t });
}

export async function reorderEmotions(ctx: Ctx, ids: string[]): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const row = await getLocal(tx, 'emotionOptions', id);
      if (row && !row.record.deletedAt && row.record.displayOrder !== i) {
        await writeLocal(ctx, 'emotionOptions', { ...row.record, displayOrder: i, updatedAt: editTime(ctx, row.record) }, { tx });
      }
    }
  });
  ctx.onWrite?.();
}
