import { AxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import {
  dailyRoutineId,
  habitLogId,
  habitProgress,
  isScheduledOn,
  journalAnswerId,
  type EmotionOptionRecord,
  type HabitLogRecord,
  type HabitRecord,
  type IdentityRecord,
  type JournalAnswerRecord,
  type JournalQuestionRecord,
  type MeasurementType,
  type PlanGoalRecord,
  type PlanReviewRecord,
  type PlanTaskRecord,
  type TimeBlockRecord,
  type UrgeRecord,
  type DailyRoutineRecord,
} from '@journal/shared';
import { api, errorMessage } from '../api';

/**
 * The owner's editor on the website. It reads raw records for a date range and writes
 * them back one at a time; the server applies the same rules as the app's sync, so every
 * change reaches the phone on its next sync.
 */

type Seq = { serverSeq: number };

export interface OwnerRecords {
  habits: (HabitRecord & Seq)[];
  journalQuestions: (JournalQuestionRecord & Seq)[];
  identities: (IdentityRecord & Seq)[];
  emotionOptions: (EmotionOptionRecord & Seq)[];
  dailyRoutines: (DailyRoutineRecord & Seq)[];
  habitLogs: (HabitLogRecord & Seq)[];
  journalAnswers: (JournalAnswerRecord & Seq)[];
  urges: (UrgeRecord & Seq)[];
  planTasks: (PlanTaskRecord & Seq)[];
  timeBlocks: (TimeBlockRecord & Seq)[];
  planGoals: (PlanGoalRecord & Seq)[];
  planReviews: (PlanReviewRecord & Seq)[];
}

export interface OwnerData {
  userId: string;
  today: string;
  records: OwnerRecords;
}

export type Editable = 'habits' | 'habitLogs' | 'dailyRoutines' | 'journalAnswers' | 'urges' | 'identities' | 'planGoals' | 'planTasks' | 'planReviews' | 'timeBlocks';

export class ConflictError extends Error {
  constructor(readonly latest: Record<string, unknown>) {
    super('This was changed on another device. Reload to see the latest version.');
  }
}

/** Saves one record (timestamps are set by the server). Returns the stored record. */
export async function save<T>(entity: Editable, record: Record<string, unknown>, baseSeq?: number | null): Promise<T & Seq> {
  try {
    const res = await api.put<{ data: T & Seq }>(`/owner/records/${entity}`, { record, baseSeq });
    return res.data.data;
  } catch (e) {
    if (e instanceof AxiosError && e.response?.status === 409 && e.response.data?.record) throw new ConflictError(e.response.data.record);
    throw e;
  }
}

export const remove = (entity: Editable, record: { id: string } & Record<string, unknown>) => save(entity, { ...record, deletedAt: 'now' });

export const newId = () => crypto.randomUUID();

/** Loads everything for [from, to]; `reload` refetches without showing a loading state. */
export function useOwnerData(from: string, to: string) {
  const [data, setData] = useState<OwnerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: OwnerData }>(`/owner/data?from=${from}&to=${to}`);
      setData(res.data.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, reload: load };
}

// ------------------------------------------------------------------ habits for a day

export interface HabitForDay {
  habit: HabitRecord & Seq;
  log: (HabitLogRecord & Seq) | undefined;
  value: number;
  target: number;
  unit: string | null;
  type: MeasurementType;
  progress: number;
}

const createdOn = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Same rule as the app: active, scheduled, existing habits, plus any already logged that day. */
export function habitsForDate(r: OwnerRecords, date: string): HabitForDay[] {
  const logs = new Map(r.habitLogs.filter((l) => l.localDate === date).map((l) => [l.habitId, l]));
  return r.habits
    .filter((h) => logs.has(h.id) || (h.isActive && !h.archivedAt && isScheduledOn(h.scheduleDays, date) && createdOn(h.createdAt) <= date))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((habit) => {
      const log = logs.get(habit.id);
      const value = log?.value ?? 0;
      const target = log?.targetSnapshot ?? habit.targetValue;
      const type = log?.typeSnapshot ?? habit.measurementType;
      return { habit, log, value, target, unit: log ? log.unitSnapshot : habit.unit, type, progress: habitProgress(type, value, target) };
    });
}

export function setHabitValue(userId: string, h: HabitForDay, date: string, value: number) {
  const type = h.log?.typeSnapshot ?? h.habit.measurementType;
  const clean = type === 'boolean' ? (value >= 1 ? 1 : 0) : Math.max(0, Math.round(value * 100) / 100);
  return save<HabitLogRecord>('habitLogs', {
    id: habitLogId(userId, h.habit.id, date),
    habitId: h.habit.id,
    localDate: date,
    value: clean,
    targetSnapshot: h.log?.targetSnapshot ?? h.habit.targetValue,
    unitSnapshot: h.log ? h.log.unitSnapshot : h.habit.unit,
    typeSnapshot: type,
  });
}

// ------------------------------------------------------------------ journal for a day

export interface DayQuestion {
  questionId: string;
  text: string;
  type: 'text' | 'emoji';
  systemKey: string | null;
  isRequired: boolean;
  answer: (JournalAnswerRecord & Seq) | undefined;
}

export function journalDay(r: OwnerRecords, userId: string, date: string): DayQuestion[] {
  const routineId = dailyRoutineId(userId, date);
  const answers = new Map(r.journalAnswers.filter((a) => a.routineId === routineId).map((a) => [a.questionId, a]));
  const answered = (a: JournalAnswerRecord | undefined) =>
    !!a && (a.questionTypeSnapshot === 'emoji' ? a.emojiValue !== null : !!a.textValue?.trim());
  const out: DayQuestion[] = r.journalQuestions
    .filter((q) => (q.isActive && !q.archivedAt) || answered(answers.get(q.id)))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => ({ questionId: q.id, text: q.text, type: q.type, systemKey: q.systemKey, isRequired: q.isRequired, answer: answers.get(q.id) }));
  const shown = new Set(out.map((q) => q.questionId));
  for (const a of answers.values()) {
    if (!shown.has(a.questionId) && answered(a)) {
      out.push({ questionId: a.questionId, text: a.questionTextSnapshot, type: a.questionTypeSnapshot, systemKey: null, isRequired: false, answer: a });
    }
  }
  return out;
}

/** Saves an answer, creating the day's routine first if needed. */
export async function saveAnswer(
  r: OwnerRecords,
  userId: string,
  date: string,
  q: DayQuestion,
  value: { textValue?: string | null; emojiValue?: number | null },
) {
  const routineId = dailyRoutineId(userId, date);
  if (!r.dailyRoutines.some((x) => x.id === routineId)) {
    r.dailyRoutines.push(await save<DailyRoutineRecord>('dailyRoutines', { id: routineId, localDate: date }));
  }
  const type = q.answer?.questionTypeSnapshot ?? q.type;
  return save<JournalAnswerRecord>(
    'journalAnswers',
    {
      id: journalAnswerId(userId, date, q.questionId),
      routineId,
      questionId: q.questionId,
      questionTextSnapshot: q.answer?.questionTextSnapshot ?? q.text,
      questionTypeSnapshot: type,
      textValue: type === 'text' ? (value.textValue ?? null) : null,
      emojiValue: type === 'emoji' ? (value.emojiValue ?? null) : null,
    },
    // Text answers are checked against edits made on the phone since this page loaded.
    q.answer?.serverSeq ?? null,
  );
}

/** Replaces one record in the loaded data after a save, so the page updates at once. */
export function upsertLocal<K extends keyof OwnerRecords>(r: OwnerRecords, key: K, rec: OwnerRecords[K][number]): OwnerRecords {
  const list = (r[key] as { id: string }[]).filter((x) => x.id !== rec.id);
  if (!(rec as { deletedAt?: string | null }).deletedAt) list.push(rec);
  return { ...r, [key]: list };
}
