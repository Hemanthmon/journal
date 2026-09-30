import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import {
  createQuestion,
  deleteQuestion,
  getJournalDay,
  journalCompletion,
  listQuestions,
  saveAnswer,
  updateQuestion,
} from './journal';
import { loadDashboard } from './dashboard';
import { exportJournalCsv, csvEscape } from './exporter';

let ctx: ReturnType<typeof makeCtx>;

beforeEach(async () => {
  ctx = makeCtx(await createTestDb());
});

async function defaults() {
  const day = await createQuestion(ctx, { text: 'How was your day? Tell us about it.', type: 'text' });
  const mood = await createQuestion(ctx, { text: 'How are you feeling today?', type: 'emoji' });
  const grateful = await createQuestion(ctx, { text: 'What are you grateful for today?', type: 'text' });
  return { day, mood, grateful };
}

describe('daily routine saving', () => {
  it('saves an incomplete day offline and reads it back', async () => {
    const { day, mood, grateful } = await defaults();
    await saveAnswer(ctx, '2026-09-29', day, { textValue: 'Long day.\nGood walk in the evening.' });
    await saveAnswer(ctx, '2026-09-29', mood, { emojiValue: 4 });

    const journal = await getJournalDay(ctx, '2026-09-29');
    expect(journal.routine?.localDate).toBe('2026-09-29');
    expect(journal.questions.map((q) => [q.text, q.answer?.textValue ?? q.answer?.emojiValue ?? null])).toEqual([
      [day.text, 'Long day.\nGood walk in the evening.'],
      [mood.text, 4],
      [grateful.text, null],
    ]);
    expect(journalCompletion(journal)).toEqual({ answered: 2, total: 3, requiredMissing: 0 });
  });

  it('allows one mood per day: selecting again replaces it', async () => {
    const { mood } = await defaults();
    await saveAnswer(ctx, '2026-09-29', mood, { emojiValue: 2 });
    await saveAnswer(ctx, '2026-09-29', mood, { emojiValue: 5 });
    const rows = await ctx.db.all('SELECT * FROM journal_answers');
    expect(rows).toHaveLength(1);
  });

  it('coalesces autosaves: many edits to one answer upload once', async () => {
    const { day } = await defaults();
    const before = await outboxCount(ctx.db);
    for (const text of ['T', 'To', 'Tod', 'Today was fine']) {
      ctx.advance(500);
      await saveAnswer(ctx, '2026-09-29', day, { textValue: text });
    }
    // routine + answer
    expect((await outboxCount(ctx.db)) - before).toBe(2);
    const journal = await getJournalDay(ctx, '2026-09-29');
    expect(journal.questions[0]!.answer?.textValue).toBe('Today was fine');
  });

  it('edits previous dates', async () => {
    const { day } = await defaults();
    await saveAnswer(ctx, '2026-09-01', day, { textValue: 'first draft' });
    await saveAnswer(ctx, '2026-09-01', day, { textValue: 'edited later' });
    expect((await getJournalDay(ctx, '2026-09-01')).questions[0]!.answer?.textValue).toBe('edited later');
  });

  it('keeps answers readable after their question is edited, disabled or deleted', async () => {
    const { day, grateful } = await defaults();
    await saveAnswer(ctx, '2026-09-29', day, { textValue: 'A calm day' });
    await saveAnswer(ctx, '2026-09-29', grateful, { textValue: 'Friends' });
    await updateQuestion(ctx, day.id, { text: 'Describe today' });
    await deleteQuestion(ctx, grateful.id);

    const journal = await getJournalDay(ctx, '2026-09-29');
    const texts = journal.questions.map((q) => [q.text, q.answer?.questionTextSnapshot, q.answer?.textValue]);
    expect(texts).toContainEqual(['Describe today', 'How was your day? Tell us about it.', 'A calm day']);
    expect(texts).toContainEqual(['What are you grateful for today?', 'What are you grateful for today?', 'Friends']);
    expect((await listQuestions(ctx)).map((q) => q.id)).not.toContain(grateful.id);
  });

  it('reports unanswered required questions without blocking saving', async () => {
    const q = await createQuestion(ctx, { text: 'Required one', type: 'text', isRequired: true });
    const journal = await getJournalDay(ctx, '2026-09-29');
    expect(journalCompletion(journal).requiredMissing).toBe(1);
    await saveAnswer(ctx, '2026-09-29', q, { textValue: 'done' });
    expect(journalCompletion(await getJournalDay(ctx, '2026-09-29')).requiredMissing).toBe(0);
  });
});

describe('dashboard and export', () => {
  it('summarises today without guilt-inducing data (just counts and percentages)', async () => {
    await defaults();
    const dash = await loadDashboard(ctx, '2026-09-29');
    expect(dash.habits).toMatchObject({ scheduled: 0, completed: 0, percent: null });
    expect(dash.week).toHaveLength(7);
    expect(dash.journal).toMatchObject({ answered: 0, total: 3, mood: null });
  });

  it('exports journal CSV with escaping and formula protection', async () => {
    const { day } = await defaults();
    await saveAnswer(ctx, '2026-09-29', day, { textValue: 'He said "hi", then left\n=SUM(A1)' });
    const csv = await exportJournalCsv(ctx);
    expect(csv.startsWith('﻿Date,Day,Question,Answer')).toBe(true);
    expect(csv).toContain('"He said ""hi"", then left\n=SUM(A1)"');
    expect(csvEscape('=cmd')).toBe("'=cmd");
  });
});
