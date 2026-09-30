import type { ReminderRecord } from '@journal/shared';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

/** All non-deleted reminders in display order (active and paused). */
export function listReminders(ctx: Ctx): Promise<ReminderRecord[]> {
  return listLocal(ctx.db, 'reminders', { orderBy: 'display_order, created_at' });
}

/** Reminders to show on the dashboard. */
export function activeReminders(ctx: Ctx): Promise<ReminderRecord[]> {
  return listLocal(ctx.db, 'reminders', { where: 'is_active = 1', orderBy: 'display_order, created_at' });
}

export async function getReminder(ctx: Ctx, id: string): Promise<ReminderRecord | undefined> {
  const row = await getLocal(ctx.db, 'reminders', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

export async function createReminder(ctx: Ctx, text: string): Promise<ReminderRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>('SELECT MAX(display_order) AS m FROM reminders WHERE deleted_at IS NULL');
  return writeLocal(ctx, 'reminders', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    text,
    isActive: true,
    displayOrder: (max?.m ?? -1) + 1,
  });
}

export async function updateReminder(
  ctx: Ctx,
  id: string,
  patch: Partial<Pick<ReminderRecord, 'text' | 'isActive' | 'displayOrder'>>,
): Promise<ReminderRecord> {
  const current = await getReminder(ctx, id);
  if (!current) throw new Error('Reminder not found');
  return writeLocal(ctx, 'reminders', { ...current, ...patch, updatedAt: editTime(ctx, current) });
}

export async function deleteReminder(ctx: Ctx, id: string): Promise<void> {
  const current = await getReminder(ctx, id);
  if (!current) return;
  const t = editTime(ctx, current);
  await writeLocal(ctx, 'reminders', { ...current, deletedAt: t, updatedAt: t });
}

export async function reorderReminders(ctx: Ctx, ids: string[]): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const row = await getLocal(tx, 'reminders', id);
      if (row && row.record.displayOrder !== i) {
        await writeLocal(ctx, 'reminders', { ...row.record, displayOrder: i, updatedAt: editTime(ctx, row.record) }, { tx });
      }
    }
  });
  ctx.onWrite?.();
}
