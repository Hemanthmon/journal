import type { PoolConnection } from 'mysql2/promise';
import {
  dailyRoutineId,
  journalAnswerId,
  type DailyRoutineDetail,
  type JournalAnswer,
} from '@journal/shared';
import type { Queryable } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { editTime, saveRecord, withoutSeq } from '../../records/crud';
import { findRecord, listRecords, type ServerRecord } from '../../records/records';

/** Returns the day's routine, creating (or restoring) it. Its id is derived from the date. */
export async function ensureRoutine(conn: PoolConnection, userId: string, localDate: string) {
  const id = dailyRoutineId(userId, localDate);
  const existing = await findRecord(conn, 'dailyRoutines', userId, id, { includeDeleted: true, forUpdate: true });
  if (existing && !existing.deletedAt) return existing;
  const now = editTime(existing);
  return saveRecord(conn, userId, 'dailyRoutines', {
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    localDate,
  });
}

/**
 * Saves the answer to one question for one day. The answer stores a snapshot of the
 * question's current text and type, so it stays readable if the question later changes.
 * Answers to TEXT questions use `textValue`; EMOJI questions use `emojiValue`.
 */
export async function upsertAnswer(
  conn: PoolConnection,
  userId: string,
  localDate: string,
  questionId: string,
  value: { textValue?: string | null; emojiValue?: number | null },
): Promise<ServerRecord<'journalAnswers'>> {
  const question = await findRecord(conn, 'journalQuestions', userId, questionId);
  if (!question) throw notFound('Question not found');
  const routine = await ensureRoutine(conn, userId, localDate);

  const id = journalAnswerId(userId, localDate, questionId);
  const existing = await findRecord(conn, 'journalAnswers', userId, id, { includeDeleted: true, forUpdate: true });
  const now = editTime(existing);
  return saveRecord(conn, userId, 'journalAnswers', {
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    routineId: routine.id,
    questionId,
    questionTextSnapshot: question.text,
    questionTypeSnapshot: question.type,
    textValue: question.type === 'text' ? (value.textValue ?? null) : null,
    emojiValue: question.type === 'emoji' ? (value.emojiValue ?? null) : null,
  });
}

/** Updates an existing answer's value, keeping its question snapshot. */
export async function updateAnswerValue(
  conn: PoolConnection,
  current: ServerRecord<'journalAnswers'>,
  userId: string,
  value: { textValue?: string | null; emojiValue?: number | null },
) {
  const text = current.questionTypeSnapshot === 'text';
  return saveRecord(conn, userId, 'journalAnswers', {
    ...withoutSeq(current),
    updatedAt: editTime(current),
    textValue: text ? (value.textValue !== undefined ? value.textValue : current.textValue) : null,
    emojiValue: text ? null : value.emojiValue !== undefined ? value.emojiValue : current.emojiValue,
  });
}

export type AnswerWithDate = JournalAnswer & { localDate: string };

/** Answers joined with their routine's date, optionally within a date range. */
export async function listAnswers(
  db: Queryable,
  userId: string,
  range: { from?: string; to?: string },
): Promise<AnswerWithDate[]> {
  const where = ['EXISTS (SELECT 1 FROM daily_routines r WHERE r.id = t.routine_id AND r.deleted_at IS NULL'];
  const params: string[] = [];
  if (range.from) {
    where[0] += ' AND r.local_date >= ?';
    params.push(range.from);
  }
  if (range.to) {
    where[0] += ' AND r.local_date <= ?';
    params.push(range.to);
  }
  where[0] += ')';
  const answers = await listRecords(db, 'journalAnswers', userId, {
    where: where.join(' AND '),
    params,
    orderBy: 't.created_at',
  });
  const routines = await listRecords(db, 'dailyRoutines', userId, { orderBy: 't.local_date' });
  const dateById = new Map(routines.map((r) => [r.id, r.localDate]));
  return answers
    .map((a) => ({ ...a, localDate: dateById.get(a.routineId) ?? '' }))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

/** Everything recorded for a range of days: routine, answers and habit logs per date. */
export async function listDays(
  db: Queryable,
  userId: string,
  range: { from?: string; to?: string },
): Promise<DailyRoutineDetail[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (range.from) {
    where.push('t.local_date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    where.push('t.local_date <= ?');
    params.push(range.to);
  }
  const filter = { where: where.join(' AND ') || undefined, params };
  const [routines, logs, answers] = await Promise.all([
    listRecords(db, 'dailyRoutines', userId, { ...filter, orderBy: 't.local_date' }),
    listRecords(db, 'habitLogs', userId, { ...filter, orderBy: 't.local_date' }),
    listAnswers(db, userId, range),
  ]);

  const days = new Map<string, DailyRoutineDetail>();
  const day = (localDate: string) => {
    let d = days.get(localDate);
    if (!d) {
      d = { localDate, routine: null, answers: [], habitLogs: [] };
      days.set(localDate, d);
    }
    return d;
  };
  for (const r of routines) day(r.localDate).routine = r;
  for (const l of logs) day(l.localDate).habitLogs.push(l);
  for (const { localDate, ...a } of answers) day(localDate).answers.push(a);
  return [...days.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
}
