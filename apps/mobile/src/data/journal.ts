import {
  dailyRoutineId,
  journalAnswerId,
  type DailyRoutineRecord,
  type JournalAnswerRecord,
  type JournalQuestionRecord,
  type QuestionType,
} from '@journal/shared';
import type { Db } from '../db/types';
import { editTime, getLocal, listLocal, writeLocal, type Ctx } from './records';

// ---------------------------------------------------------------- questions

export interface QuestionDraft {
  text: string;
  type: QuestionType;
  isRequired?: boolean;
  isActive?: boolean;
}

export function listQuestions(ctx: Ctx): Promise<JournalQuestionRecord[]> {
  return listLocal(ctx.db, 'journalQuestions', { orderBy: 'display_order, created_at' });
}

export async function getQuestion(ctx: Ctx, id: string): Promise<JournalQuestionRecord | undefined> {
  const row = await getLocal(ctx.db, 'journalQuestions', id);
  return row && !row.record.deletedAt ? row.record : undefined;
}

export async function createQuestion(ctx: Ctx, draft: QuestionDraft): Promise<JournalQuestionRecord> {
  const now = ctx.now().toISOString();
  const max = await ctx.db.get<{ m: number | null }>(
    'SELECT MAX(display_order) AS m FROM journal_questions WHERE deleted_at IS NULL',
  );
  return writeLocal(ctx, 'journalQuestions', {
    id: ctx.uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    text: draft.text,
    type: draft.type,
    isRequired: draft.isRequired ?? false,
    isActive: draft.isActive ?? true,
    archivedAt: null,
    displayOrder: (max?.m ?? -1) + 1,
    systemKey: null,
  });
}

/** Editing a question never changes existing answers — they keep their text snapshot. */
export async function updateQuestion(
  ctx: Ctx,
  id: string,
  patch: Partial<QuestionDraft> & { archived?: boolean; displayOrder?: number },
): Promise<JournalQuestionRecord> {
  const current = await getQuestion(ctx, id);
  if (!current) throw new Error('Question not found');
  const { archived, ...fields } = patch;
  const next: Record<string, unknown> = { ...current, ...fields, updatedAt: editTime(ctx, current) };
  if (archived !== undefined) next.archivedAt = archived ? (current.archivedAt ?? ctx.now().toISOString()) : null;
  return writeLocal(ctx, 'journalQuestions', next);
}

export async function deleteQuestion(ctx: Ctx, id: string): Promise<void> {
  const current = await getQuestion(ctx, id);
  if (!current) return;
  const t = editTime(ctx, current);
  await writeLocal(ctx, 'journalQuestions', { ...current, deletedAt: t, updatedAt: t });
}

export async function reorderQuestions(ctx: Ctx, ids: string[]): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const row = await getLocal(tx, 'journalQuestions', id);
      if (row && row.record.displayOrder !== i) {
        await writeLocal(
          ctx,
          'journalQuestions',
          { ...row.record, displayOrder: i, updatedAt: editTime(ctx, row.record) },
          { tx },
        );
      }
    }
  });
  ctx.onWrite?.();
}

// ---------------------------------------------------------------- daily journal

export interface DayQuestion {
  questionId: string;
  text: string;
  type: QuestionType;
  isRequired: boolean;
  /** The question itself (null if it was deleted since this day's answer). */
  question: JournalQuestionRecord | null;
  answer: JournalAnswerRecord | undefined;
}

export interface JournalDay {
  localDate: string;
  routine: DailyRoutineRecord | undefined;
  questions: DayQuestion[];
}

function isAnswered(a: JournalAnswerRecord | undefined): boolean {
  if (!a || a.deletedAt) return false;
  return a.questionTypeSnapshot === 'emoji' ? a.emojiValue !== null : !!a.textValue?.trim();
}

/**
 * The journal for a date: active questions (in order) with their answers, plus answers
 * to questions that have since been disabled or deleted, shown with their snapshot.
 */
export async function getJournalDay(ctx: Ctx, localDate: string): Promise<JournalDay> {
  const routineRow = await getLocal(ctx.db, 'dailyRoutines', dailyRoutineId(ctx.userId, localDate));
  const routine = routineRow && !routineRow.record.deletedAt ? routineRow.record : undefined;
  const [questions, answers] = await Promise.all([
    listQuestions(ctx),
    routine
      ? listLocal(ctx.db, 'journalAnswers', { where: 'routine_id = ?', params: [routine.id] })
      : Promise.resolve([] as JournalAnswerRecord[]),
  ]);
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
  const out: DayQuestion[] = questions
    .filter((q) => (q.isActive && !q.archivedAt) || isAnswered(answerByQ.get(q.id)))
    .map((q) => ({
      questionId: q.id,
      text: q.text,
      type: q.type,
      isRequired: q.isRequired,
      question: q,
      answer: answerByQ.get(q.id),
    }));
  const shown = new Set(out.map((q) => q.questionId));
  for (const a of answers) {
    if (!shown.has(a.questionId) && isAnswered(a)) {
      out.push({
        questionId: a.questionId,
        text: a.questionTextSnapshot,
        type: a.questionTypeSnapshot,
        isRequired: false,
        question: null,
        answer: a,
      });
    }
  }
  return { localDate, routine, questions: out };
}

async function ensureRoutine(ctx: Ctx, tx: Db, localDate: string): Promise<DailyRoutineRecord> {
  const id = dailyRoutineId(ctx.userId, localDate);
  const existing = await getLocal(tx, 'dailyRoutines', id);
  if (existing && !existing.record.deletedAt) return existing.record;
  const now = editTime(ctx, existing?.record);
  return writeLocal(
    ctx,
    'dailyRoutines',
    { id, createdAt: existing?.record.createdAt ?? now, updatedAt: now, deletedAt: null, localDate },
    { tx },
  );
}

/**
 * Saves one answer for a date (creating the day's routine if needed). Works offline;
 * unanswered questions are simply left out. The question's current text/type is stored
 * with the answer.
 */
export async function saveAnswer(
  ctx: Ctx,
  localDate: string,
  question: { id: string; text: string; type: QuestionType },
  value: { textValue?: string | null; emojiValue?: number | null },
): Promise<JournalAnswerRecord> {
  const result = await ctx.db.transaction(async (tx) => {
    const routine = await ensureRoutine(ctx, tx, localDate);
    const id = journalAnswerId(ctx.userId, localDate, question.id);
    const existing = await getLocal(tx, 'journalAnswers', id);
    const now = editTime(ctx, existing?.record);
    // An answer keeps the question snapshot it was first given.
    const textSnapshot = existing?.record.questionTextSnapshot ?? question.text;
    const typeSnapshot = existing?.record.questionTypeSnapshot ?? question.type;
    return writeLocal(
      ctx,
      'journalAnswers',
      {
        id,
        createdAt: existing?.record.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        routineId: routine.id,
        questionId: question.id,
        questionTextSnapshot: textSnapshot,
        questionTypeSnapshot: typeSnapshot,
        textValue: typeSnapshot === 'text' ? (value.textValue ?? null) : null,
        emojiValue: typeSnapshot === 'emoji' ? (value.emojiValue ?? null) : null,
      },
      { tx },
    );
  });
  ctx.onWrite?.();
  return result;
}

export function journalCompletion(day: JournalDay): { answered: number; total: number; requiredMissing: number } {
  const total = day.questions.filter((q) => q.question?.isActive).length;
  const answered = day.questions.filter((q) => isAnswered(q.answer)).length;
  const requiredMissing = day.questions.filter((q) => q.isRequired && !isAnswered(q.answer)).length;
  return { answered, total, requiredMissing };
}

export { isAnswered };
