import {
  MOOD_SYSTEM_KEY,
  addDays,
  dailyRoutineId,
  dateRange,
  type ReminderRecord,
  type UrgeRecord,
} from '@journal/shared';
import { habitsForDate, type HabitForDay } from './habits';
import { getJournalDay, isAnswered, journalCompletion } from './journal';
import { activeReminders } from './reminders';
import { listUrges } from './urges';
import type { Ctx } from './records';

export interface HabitDaySummary {
  scheduled: number;
  completed: number;
  /** Average progress across scheduled habits, 0..100 (null if nothing scheduled). */
  percent: number | null;
  habits: HabitForDay[];
}

export async function habitDaySummary(ctx: Ctx, localDate: string): Promise<HabitDaySummary> {
  const habits = await habitsForDate(ctx, localDate);
  const completed = habits.filter((h) => h.progress >= 100).length;
  const percent = habits.length ? habits.reduce((s, h) => s + h.progress, 0) / habits.length : null;
  return { scheduled: habits.length, completed, percent, habits };
}

/** The mood (1..5) recorded for a date via the built-in mood question, if any. */
export async function moodFor(ctx: Ctx, localDate: string): Promise<number | null> {
  const row = await ctx.db.get<{ emoji_value: number | null }>(
    `SELECT a.emoji_value FROM journal_answers a
       JOIN journal_questions q ON q.id = a.question_id
      WHERE a.routine_id = ? AND q.system_key = ? AND a.deleted_at IS NULL`,
    [dailyRoutineId(ctx.userId, localDate), MOOD_SYSTEM_KEY],
  );
  return row?.emoji_value ?? null;
}

/** Built-in question "What's one thing you could do better tomorrow?" */
export const TOMORROW_SYSTEM_KEY = 'tomorrow';

/**
 * What the user wrote yesterday for "What's one thing you could do better tomorrow?",
 * to show as today's focus. Uses the built-in question, even if it was since edited.
 */
export async function intentionFor(ctx: Ctx, today: string): Promise<{ text: string; fromDate: string } | null> {
  const yesterday = addDays(today, -1);
  const row = await ctx.db.get<{ text_value: string | null }>(
    `SELECT a.text_value FROM journal_answers a
       JOIN journal_questions q ON q.id = a.question_id
      WHERE a.routine_id = ? AND q.system_key = ? AND a.deleted_at IS NULL`,
    [dailyRoutineId(ctx.userId, yesterday), TOMORROW_SYSTEM_KEY],
  );
  const text = row?.text_value?.trim();
  return text ? { text, fromDate: yesterday } : null;
}

export interface WeekDay {
  localDate: string;
  habitPercent: number | null;
  mood: number | null;
  journalWritten: boolean;
}

export interface Dashboard {
  today: string;
  habits: HabitDaySummary;
  journal: { answered: number; total: number; mood: number | null };
  urges: { todayCount: number; recent: UrgeRecord[] };
  week: WeekDay[];
  reminders: ReminderRecord[];
  intention: { text: string; fromDate: string } | null;
}

export async function loadDashboard(ctx: Ctx, today: string): Promise<Dashboard> {
  const [habits, journalDay, mood, todayUrges, recent, reminders, intention] = await Promise.all([
    habitDaySummary(ctx, today),
    getJournalDay(ctx, today),
    moodFor(ctx, today),
    listUrges(ctx, { from: today, to: today }),
    listUrges(ctx, { from: addDays(today, -6), to: today }),
    activeReminders(ctx),
    intentionFor(ctx, today),
  ]);
  const { answered, total } = journalCompletion(journalDay);

  const week: WeekDay[] = [];
  for (const d of dateRange(addDays(today, -6), today)) {
    const [h, m, j] = await Promise.all([habitDaySummary(ctx, d), moodFor(ctx, d), getJournalDay(ctx, d)]);
    week.push({
      localDate: d,
      habitPercent: h.percent,
      mood: m,
      journalWritten: j.questions.some((q) => q.type === 'text' && isAnswered(q.answer)),
    });
  }

  return {
    today,
    habits,
    journal: { answered, total, mood },
    urges: { todayCount: todayUrges.length, recent: recent.slice(0, 3) },
    week,
    reminders,
    intention,
  };
}

export interface HistoryDay {
  localDate: string;
  answered: number;
  preview: string | null;
  mood: number | null;
}

/** Days with journal entries, newest first. */
export async function journalHistory(ctx: Ctx, limit = 120): Promise<HistoryDay[]> {
  const rows = await ctx.db.all<{ local_date: string }>(
    `SELECT r.local_date FROM daily_routines r
      WHERE r.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM journal_answers a WHERE a.routine_id = r.id AND a.deleted_at IS NULL
                    AND (a.emoji_value IS NOT NULL OR TRIM(COALESCE(a.text_value, '')) <> ''))
      ORDER BY r.local_date DESC LIMIT ?`,
    [limit],
  );
  const out: HistoryDay[] = [];
  for (const { local_date } of rows) {
    const day = await getJournalDay(ctx, local_date);
    const firstText = day.questions.find((q) => q.type === 'text' && isAnswered(q.answer));
    out.push({
      localDate: local_date,
      answered: day.questions.filter((q) => isAnswered(q.answer)).length,
      preview: firstText?.answer?.textValue?.trim().slice(0, 120) ?? null,
      mood: await moodFor(ctx, local_date),
    });
  }
  return out;
}

export interface HabitHistory {
  habitId: string;
  name: string;
  days: { localDate: string; progress: number | null }[];
  scheduledDays: number;
  completedDays: number;
}

/** Per-habit progress for the last `days` days. `null` = not scheduled that day. */
export async function habitHistory(ctx: Ctx, today: string, days = 14): Promise<HabitHistory[]> {
  const range = dateRange(addDays(today, -(days - 1)), today);
  const perDay = await Promise.all(range.map((d) => habitsForDate(ctx, d)));
  const byHabit = new Map<string, HabitHistory>();
  range.forEach((d, i) => {
    for (const h of perDay[i]!) {
      let entry = byHabit.get(h.habit.id);
      if (!entry) {
        entry = { habitId: h.habit.id, name: h.habit.name, days: [], scheduledDays: 0, completedDays: 0 };
        byHabit.set(h.habit.id, entry);
      }
      entry.scheduledDays++;
      if (h.progress >= 100) entry.completedDays++;
    }
  });
  for (const entry of byHabit.values()) {
    entry.days = range.map((d, i) => {
      const h = perDay[i]!.find((x) => x.habit.id === entry.habitId);
      return { localDate: d, progress: h ? h.progress : null };
    });
  }
  return [...byHabit.values()];
}
