import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import { intentionFor, loadDashboard } from './dashboard';
import { createQuestion, saveAnswer } from './journal';
import { getLocal } from './records';
import {
  activeReminders,
  createReminder,
  deleteReminder,
  listReminders,
  reorderReminders,
  updateReminder,
} from './reminders';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

describe('daily reminders', () => {
  it('adds, edits, pauses, reorders and deletes reminders offline, queued for sync', async () => {
    const a = await createReminder(ctx, 'Phone stays outside the bedroom');
    const b = await createReminder(ctx, 'Go for a walk when bored');
    expect((await getLocal(ctx.db, 'reminders', a.id))?.syncStatus).toBe('pending');
    expect(await outboxCount(ctx.db)).toBe(2);

    ctx.advance(1000);
    await updateReminder(ctx, a.id, { text: 'Phone charges in the kitchen' });
    await reorderReminders(ctx, [b.id, a.id]);
    expect((await listReminders(ctx)).map((r) => r.text)).toEqual(['Go for a walk when bored', 'Phone charges in the kitchen']);

    await updateReminder(ctx, b.id, { isActive: false });
    expect((await activeReminders(ctx)).map((r) => r.text)).toEqual(['Phone charges in the kitchen']);

    await deleteReminder(ctx, a.id);
    expect((await listReminders(ctx)).map((r) => r.text)).toEqual(['Go for a walk when bored']);
  });

  it('rejects empty reminders', async () => {
    await expect(createReminder(ctx, '   ')).rejects.toThrow(/Write a reminder/);
  });
});

describe("yesterday's intention on the dashboard", () => {
  it("shows what was written yesterday for 'do better tomorrow', only on the next day", async () => {
    const tomorrowQ = await createQuestion(ctx, { text: "What's one thing you could do better tomorrow?", type: 'text' });
    // The built-in question is marked by the server; simulate that marker locally.
    await ctx.db.run("UPDATE journal_questions SET system_key = 'tomorrow' WHERE id = ?", [tomorrowQ.id]);

    await saveAnswer(ctx, '2026-09-29', tomorrowQ, { textValue: '  Sleep before 11 PM  ' });
    expect(await intentionFor(ctx, '2026-09-30')).toEqual({ text: 'Sleep before 11 PM', fromDate: '2026-09-29' });
    expect(await intentionFor(ctx, '2026-09-29')).toBeNull();
    expect(await intentionFor(ctx, '2026-10-01')).toBeNull();

    await createReminder(ctx, 'Drink water');
    const dash = await loadDashboard(ctx, '2026-09-30');
    expect(dash.intention?.text).toBe('Sleep before 11 PM');
    expect(dash.reminders.map((r) => r.text)).toEqual(['Drink water']);
  });

  it('ignores a blank answer', async () => {
    const q = await createQuestion(ctx, { text: 'Better tomorrow?', type: 'text' });
    await ctx.db.run("UPDATE journal_questions SET system_key = 'tomorrow' WHERE id = ?", [q.id]);
    await saveAnswer(ctx, '2026-09-29', q, { textValue: '   ' });
    expect(await intentionFor(ctx, '2026-09-30')).toBeNull();
  });
});
