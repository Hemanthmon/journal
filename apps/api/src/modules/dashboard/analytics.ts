import {
  addDays,
  dateRange,
  habitProgress,
  urgeDiverted,
  INTENSITY_BANDS,
  MOOD_OPTIONS,
  TIME_BLOCKS,
  type OutcomeCounts,
  weekdayName,
  weekdayOf,
  type ActivityItem,
  type DailyRoutineRecord,
  type DashboardOverview,
  type DayAnswer,
  type DayDetail,
  type DaySeriesPoint,
  type DaySummary,
  type HabitDay,
  type HabitDetail,
  type HabitLogRecord,
  type HabitRecord,
  type HabitSummary,
  type JournalAnswerRecord,
  type JournalQuestionRecord,
  type ResolvedRange,
  type UrgeAnalytics,
  type UrgeRecord,
  type UrgeStats,
  type UrgeView,
} from '@journal/shared';
import { localDateIn, localTimeIn } from '../../lib/tz';

/**
 * Read-only analytics for the web dashboard, computed from the owner's records. Pure
 * functions: no database access, so they are unit-testable.
 *
 * "Scheduled" for a past day: the habit has a log that day, or it was active, existed,
 * wasn't yet archived/deleted, and that weekday is in its schedule. Days a habit wasn't
 * scheduled never count against it. (A habit's schedule/active flag isn't versioned, so
 * the current schedule is used for past days without a log.)
 */

export interface OwnerData {
  timezone: string;
  today: string;
  habits: HabitRecord[];
  logs: HabitLogRecord[];
  routines: DailyRoutineRecord[];
  answers: JournalAnswerRecord[];
  questions: JournalQuestionRecord[];
  urges: UrgeRecord[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function resolveRange(q: { from?: string; to?: string }, today: string, firstDate: string): ResolvedRange {
  const from = q.from ?? firstDate;
  const to = q.to ?? today;
  const days = Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
  return { from, to, days };
}

/** Earliest date with any data, for "All records". */
export function firstDataDate(d: OwnerData): string {
  const dates = [
    ...d.habits.map((h) => localDateIn(new Date(h.createdAt), d.timezone)),
    ...d.logs.map((l) => l.localDate),
    ...d.routines.map((r) => r.localDate),
    ...d.urges.map((u) => u.localDate),
  ];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : d.today;
}

/** Precomputed per-dataset lookups. */
export class Analyzer {
  private readonly logsByDate = new Map<string, Map<string, HabitLogRecord>>();
  private readonly habitMeta: { h: HabitRecord; created: string; ended: string | null }[];
  private readonly questionById: Map<string, JournalQuestionRecord>;
  private readonly routineDate: Map<string, string>;
  private readonly answersByDate = new Map<string, JournalAnswerRecord[]>();
  private readonly urgesByDate = new Map<string, UrgeRecord[]>();

  constructor(readonly d: OwnerData) {
    for (const l of d.logs) {
      if (!this.logsByDate.has(l.localDate)) this.logsByDate.set(l.localDate, new Map());
      this.logsByDate.get(l.localDate)!.set(l.habitId, l);
    }
    // In the owner's display order, so lists read the same as in the app.
    const ordered = [...d.habits].sort((x, y) => x.displayOrder - y.displayOrder || x.name.localeCompare(y.name));
    this.habitMeta = ordered.map((h) => {
      const ends = [h.archivedAt, h.deletedAt].filter((x): x is string => !!x).map((x) => localDateIn(new Date(x), d.timezone));
      return {
        h,
        created: localDateIn(new Date(h.createdAt), d.timezone),
        ended: ends.length ? ends.reduce((a, b) => (a < b ? a : b)) : null,
      };
    });
    this.questionById = new Map(d.questions.map((q) => [q.id, q]));
    this.routineDate = new Map(d.routines.map((r) => [r.id, r.localDate]));
    for (const a of d.answers) {
      const date = this.routineDate.get(a.routineId);
      if (!date) continue;
      if (!this.answersByDate.has(date)) this.answersByDate.set(date, []);
      this.answersByDate.get(date)!.push(a);
    }
    for (const u of d.urges) {
      if (!this.urgesByDate.has(u.localDate)) this.urgesByDate.set(u.localDate, []);
      this.urgesByDate.get(u.localDate)!.push(u);
    }
  }

  habitsOn(date: string): HabitDay[] {
    const logs = this.logsByDate.get(date);
    const wd = weekdayOf(date);
    const out: HabitDay[] = [];
    for (const { h, created, ended } of this.habitMeta) {
      const log = logs?.get(h.id);
      const scheduled =
        !!log ||
        (h.isActive && date >= created && (ended === null || date < ended) && h.scheduleDays.includes(wd));
      if (!scheduled) continue;
      const type = log?.typeSnapshot ?? h.measurementType;
      const target = log?.targetSnapshot ?? h.targetValue;
      const value = log?.value ?? 0;
      const progress = habitProgress(type, value, target);
      out.push({
        habitId: h.id,
        name: h.name,
        type,
        value,
        target,
        unit: log ? log.unitSnapshot : h.unit,
        progress,
        completed: progress >= 100,
      });
    }
    return out;
  }

  private answered(a: JournalAnswerRecord) {
    return a.questionTypeSnapshot === 'emoji' ? a.emojiValue !== null : !!a.textValue?.trim();
  }

  answersOn(date: string): JournalAnswerRecord[] {
    return (this.answersByDate.get(date) ?? []).filter((a) => this.answered(a));
  }

  private bySystemKey(date: string, key: string): JournalAnswerRecord | undefined {
    return this.answersOn(date).find((a) => this.questionById.get(a.questionId)?.systemKey === key);
  }

  moodOn(date: string): number | null {
    return this.bySystemKey(date, 'mood')?.emojiValue ?? null;
  }

  urgesOn(date: string): UrgeRecord[] {
    return this.urgesByDate.get(date) ?? [];
  }

  // ------------------------------------------------------------------ views

  urgeView(u: UrgeRecord): UrgeView {
    return {
      id: u.id,
      localDate: u.localDate,
      localTime: u.localTime.slice(0, 5),
      weekday: weekdayName(weekdayOf(u.localDate), 'long'),
      triggerText: u.triggerText,
      intensity: u.intensity,
      durationMinutes: u.durationMinutes ?? null,
      emotionBefore: u.emotionBefore,
      actionTaken: u.actionTaken,
      outcome: u.outcome,
      masturbated: u.masturbated,
      explicitContent: u.explicitContent,
      diverted: urgeDiverted(u),
      remarks: u.remarks,
    };
  }

  private divertedCounts(urges: UrgeRecord[]) {
    let diverted = 0;
    let notDiverted = 0;
    for (const u of urges) {
      const d = urgeDiverted(u);
      if (d === true) diverted++;
      else if (d === false) notDiverted++;
    }
    return { diverted, notDiverted, unanswered: urges.length - diverted - notDiverted };
  }

  urgeStats(urges: UrgeRecord[]): UrgeStats {
    const durations = urges.map((u) => u.durationMinutes).filter((x): x is number => x !== null && x !== undefined);
    const ai = avg(urges.map((u) => u.intensity));
    const ad = avg(durations);
    const c = this.divertedCounts(urges);
    const answered = c.diverted + c.notDiverted;
    return {
      total: urges.length,
      avgIntensity: ai === null ? null : round1(ai),
      avgDuration: ad === null ? null : round1(ad),
      totalDuration: durations.reduce((s, x) => s + x, 0),
      withDuration: durations.length,
      ...c,
      divertedPercent: answered ? round1((c.diverted / answered) * 100) : null,
    };
  }

  private urgesIn(range: ResolvedRange): UrgeRecord[] {
    return this.d.urges
      .filter((u) => u.localDate >= range.from && u.localDate <= range.to)
      .sort((a, b) => (b.localDate + b.localTime).localeCompare(a.localDate + a.localTime));
  }

  overview(range: ResolvedRange): DashboardOverview {
    const dates = dateRange(range.from, range.to);
    let scheduled = 0;
    let completed = 0;
    let progressSum = 0;
    let daysWritten = 0;
    const moods: { date: string; v: number }[] = [];
    const series: DaySeriesPoint[] = dates.map((date) => {
      const habits = this.habitsOn(date);
      scheduled += habits.length;
      completed += habits.filter((h) => h.completed).length;
      progressSum += habits.reduce((s, h) => s + h.progress, 0);
      const journal = this.answersOn(date).length > 0;
      if (journal) daysWritten++;
      const mood = this.moodOn(date);
      if (mood !== null) moods.push({ date, v: mood });
      const dayUrges = this.urgesOn(date);
      const c = this.divertedCounts(dayUrges);
      return {
        date,
        habitPercent: habits.length ? round1(avg(habits.map((h) => h.progress))!) : null,
        mood,
        journal,
        urges: dayUrges.length,
        urgesDiverted: c.diverted,
        urgesNotDiverted: c.notDiverted,
        urgesUnanswered: c.unanswered,
      };
    });

    const todayHabits = this.habitsOn(this.d.today);
    const todayAnswered = this.answersOn(this.d.today).length;
    const activeQuestions = this.d.questions.filter((q) => q.isActive && !q.archivedAt && !q.deletedAt).length;
    const todayPct = avg(todayHabits.map((h) => h.progress));
    const latest = moods.at(-1);
    const moodAvg = avg(moods.map((m) => m.v));
    const habitBreakdown = this.habitSummaries(range)
      .filter((h) => h.scheduledDays > 0)
      .map((h) => ({
        id: h.id,
        name: h.name,
        completedDays: h.completedDays,
        scheduledDays: h.scheduledDays,
        completionPercent: h.completionPercent,
      }))
      .sort((a, b) => (b.completionPercent ?? 0) - (a.completionPercent ?? 0) || a.name.localeCompare(b.name));

    return {
      range,
      today: {
        date: this.d.today,
        scheduled: todayHabits.length,
        completed: todayHabits.filter((h) => h.completed).length,
        percent: todayPct === null ? null : round1(todayPct),
        journalAnswered: todayAnswered,
        journalTotal: activeQuestions,
        mood: this.moodOn(this.d.today),
      },
      habits: {
        completedHabitDays: completed,
        scheduledHabitDays: scheduled,
        routinePercent: scheduled ? round1(progressSum / scheduled) : null,
      },
      journal: { daysWritten, days: dates.length },
      mood: { latest: latest?.v ?? null, latestDate: latest?.date ?? null, average: moodAvg === null ? null : round1(moodAvg) },
      urges: this.urgeStats(this.urgesIn(range)),
      urgeInsights: this.urgeAnalytics(range).insights,
      habitInsights: habitInsights({ series, completed, scheduled, habitBreakdown }),
      moodInsights: moodInsights({ series, days: dates.length }),
      habitBreakdown,
      moodCounts: MOOD_OPTIONS.map((m) => ({ value: m.value, count: moods.filter((x) => x.v === m.value).length })),
      series,
      recent: this.recent(range),
    };
  }

  private recent(range: ResolvedRange, limit = 12): ActivityItem[] {
    const items: (ActivityItem & { sort: string })[] = [];
    const inRange = (date: string) => date >= range.from && date <= range.to;
    for (const u of this.d.urges.filter((u) => inRange(u.localDate))) {
      items.push({
        kind: 'urge',
        date: u.localDate,
        time: u.localTime.slice(0, 5),
        title: `Urge recorded (intensity ${u.intensity})`,
        detail: u.triggerText,
        sort: `${u.localDate} ${u.localTime}`,
      });
    }
    for (const [date, answers] of this.answersByDate) {
      const done = answers.filter((a) => this.answered(a));
      if (!inRange(date) || done.length === 0) continue;
      const last = done.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
      const time = localTimeIn(new Date(last.updatedAt), this.d.timezone);
      items.push({
        kind: 'journal',
        date,
        time: localDateIn(new Date(last.updatedAt), this.d.timezone) === date ? time : null,
        title: `Journal: ${done.length} answer${done.length === 1 ? '' : 's'}`,
        detail: done.find((a) => a.questionTypeSnapshot === 'text')?.textValue?.slice(0, 120) ?? null,
        sort: `${date} ${time}`,
      });
    }
    const names = new Map(this.d.habits.map((h) => [h.id, h.name]));
    for (const l of this.d.logs.filter((l) => inRange(l.localDate) && l.value > 0)) {
      const time = localTimeIn(new Date(l.updatedAt), this.d.timezone);
      const pct = Math.round(habitProgress(l.typeSnapshot, l.value, l.targetSnapshot));
      items.push({
        kind: 'habit',
        date: l.localDate,
        time: localDateIn(new Date(l.updatedAt), this.d.timezone) === l.localDate ? time : null,
        title: `${names.get(l.habitId) ?? 'Habit'}: ${pct}%`,
        detail:
          l.typeSnapshot === 'boolean' ? 'Done' : `${l.value} / ${l.targetSnapshot}${l.unitSnapshot ? ` ${l.unitSnapshot}` : ''}`,
        sort: `${l.localDate} ${time}`,
      });
    }
    return items
      .sort((a, b) => b.sort.localeCompare(a.sort))
      .slice(0, limit)
      .map(({ sort: _s, ...rest }) => rest);
  }

  private habitStatus(h: HabitRecord): HabitSummary['status'] {
    if (h.deletedAt) return 'deleted';
    if (h.archivedAt) return 'archived';
    return h.isActive ? 'active' : 'paused';
  }

  private habitCalendar(habitId: string, range: ResolvedRange) {
    return dateRange(range.from, range.to).map((date) => {
      const day = this.habitsOn(date).find((x) => x.habitId === habitId);
      return {
        date,
        scheduled: !!day,
        value: day ? day.value : null,
        target: day ? day.target : null,
        progress: day ? day.progress : null,
      };
    });
  }

  private summarize(h: HabitRecord, calendar: ReturnType<Analyzer['habitCalendar']>): HabitSummary {
    const scheduled = calendar.filter((c) => c.scheduled);
    const completedDays = scheduled.filter((c) => (c.progress ?? 0) >= 100).length;
    const group = (key: (date: string) => string) => {
      const m = new Map<string, { completed: number; scheduled: number }>();
      for (const c of scheduled) {
        const k = key(c.date);
        const g = m.get(k) ?? { completed: 0, scheduled: 0 };
        g.scheduled++;
        if ((c.progress ?? 0) >= 100) g.completed++;
        m.set(k, g);
      }
      return [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, g]) => ({ k, ...g, percent: g.scheduled ? round1((g.completed / g.scheduled) * 100) : null }));
    };
    return {
      id: h.id,
      name: h.name,
      description: h.description,
      type: h.measurementType,
      target: h.targetValue,
      unit: h.unit,
      scheduleDays: h.scheduleDays,
      status: this.habitStatus(h),
      scheduledDays: scheduled.length,
      completedDays,
      incompleteDays: scheduled.length - completedDays,
      completionPercent: scheduled.length ? round1((completedDays / scheduled.length) * 100) : null,
      weekly: group((date) => addDays(date, -(weekdayOf(date) - 1))).map(({ k, ...g }) => ({ weekStart: k, ...g })),
      monthly: group((date) => date.slice(0, 7)).map(({ k, ...g }) => ({ month: k, ...g })),
    };
  }

  habitSummaries(range: ResolvedRange): HabitSummary[] {
    const statusOrder = { active: 0, paused: 1, archived: 2, deleted: 3 } as const;
    return this.d.habits
      .map((h) => this.summarize(h, this.habitCalendar(h.id, range)))
      .filter((s) => s.status !== 'deleted' || s.scheduledDays > 0)
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));
  }

  habitDetail(habitId: string, range: ResolvedRange): HabitDetail | undefined {
    const h = this.d.habits.find((x) => x.id === habitId);
    if (!h) return undefined;
    const calendar = this.habitCalendar(h.id, range);
    return { ...this.summarize(h, calendar), calendar };
  }

  daySummaries(range: ResolvedRange): DaySummary[] {
    return dateRange(range.from, range.to)
      .reverse()
      .map((date) => {
        const habits = this.habitsOn(date);
        const pct = avg(habits.map((h) => h.progress));
        return {
          date,
          weekday: weekdayName(weekdayOf(date), 'long'),
          habitPercent: pct === null ? null : round1(pct),
          habitsCompleted: habits.filter((h) => h.completed).length,
          habitsScheduled: habits.length,
          mood: this.moodOn(date),
          answered: this.answersOn(date).length,
          urges: this.urgesOn(date).length,
        };
      })
      .filter((d) => d.habitsScheduled > 0 || d.answered > 0 || d.urges > 0);
  }

  dayDetail(date: string): DayDetail {
    const habits = this.habitsOn(date);
    const order = (a: JournalAnswerRecord) => this.questionById.get(a.questionId)?.displayOrder ?? 9999;
    const answers: DayAnswer[] = this.answersOn(date)
      .sort((a, b) => order(a) - order(b) || a.createdAt.localeCompare(b.createdAt))
      .map((a) => ({
        questionId: a.questionId,
        question: a.questionTextSnapshot,
        type: a.questionTypeSnapshot,
        systemKey: this.questionById.get(a.questionId)?.systemKey ?? null,
        textValue: a.textValue,
        emojiValue: a.emojiValue,
        updatedAt: a.updatedAt,
      }));
    const pct = avg(habits.map((h) => h.progress));
    return {
      date,
      weekday: weekdayName(weekdayOf(date), 'long'),
      habits,
      habitPercent: pct === null ? null : round1(pct),
      answers,
      mood: this.moodOn(date),
      improveTomorrow: this.bySystemKey(date, 'tomorrow')?.textValue ?? null,
      grateful: this.bySystemKey(date, 'gratitude')?.textValue ?? null,
      urges: this.urgesOn(date)
        .slice()
        .sort((a, b) => a.localTime.localeCompare(b.localTime))
        .map((u) => this.urgeView(u)),
    };
  }

  private outcomeCounts(urges: UrgeRecord[]): OutcomeCounts {
    const c = this.divertedCounts(urges);
    const answered = c.diverted + c.notDiverted;
    return { total: urges.length, ...c, divertedPercent: answered ? round1((c.diverted / answered) * 100) : null };
  }

  urgeAnalytics(range: ResolvedRange): UrgeAnalytics {
    const urges = this.urgesIn(range);
    /** Groups free-text labels case-insensitively; most common first. */
    const group = (items: { text: string; u: UrgeRecord }[], n = 8) => {
      const m = new Map<string, { label: string; urges: UrgeRecord[] }>();
      for (const { text, u } of items) {
        const label = text.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const shown = label.length > 60 ? `${label.slice(0, 57)}…` : label;
        const e = m.get(key) ?? { label: shown, urges: [] };
        // Prefer a capitalised spelling ("Boredom" over "boredom") for display.
        if (/^[a-z]/.test(e.label) && /^[A-Z]/.test(shown)) e.label = shown;
        e.urges.push(u);
        m.set(key, e);
      }
      return [...m.values()]
        .sort((a, b) => b.urges.length - a.urges.length || a.label.localeCompare(b.label))
        .slice(0, n);
    };
    const top = (items: { text: string; u: UrgeRecord }[]) =>
      group(items).map((g) => ({ label: g.label, count: g.urges.length }));
    const triggerItems = urges.map((u) => ({ text: u.triggerText ?? '', u }));
    const emotionItems = urges.flatMap((u) => (u.emotionBefore ?? '').split(',').map((text) => ({ text, u })));
    // Oldest first, for weekly grouping and streaks.
    const chronological = urges.slice().reverse();
    // Every week touching the range, so weeks without urges show as 0.
    const weeks = new Map<string, { diverted: number; notDiverted: number }>();
    for (const date of dateRange(range.from, range.to)) {
      const week = addDays(date, -(weekdayOf(date) - 1));
      if (!weeks.has(week)) weeks.set(week, { diverted: 0, notDiverted: 0 });
    }
    const breakdown = { watchedOnly: 0, masturbatedOnly: 0, both: 0 };
    let run = 0;
    let best = 0;
    for (const u of chronological) {
      const d = urgeDiverted(u);
      if (d === null) continue;
      const week = addDays(u.localDate, -(weekdayOf(u.localDate) - 1));
      const w = weeks.get(week) ?? { diverted: 0, notDiverted: 0 };
      if (d) {
        w.diverted++;
        run++;
        best = Math.max(best, run);
      } else {
        w.notDiverted++;
        run = 0;
        if (u.explicitContent && u.masturbated) breakdown.both++;
        else if (u.explicitContent) breakdown.watchedOnly++;
        else breakdown.masturbatedOnly++;
      }
      weeks.set(week, w);
    }

    const dates = dateRange(range.from, range.to);
    const rolling = dates.map((date) => {
      const window: UrgeRecord[] = [];
      for (let i = 0; i < 7; i++) window.push(...this.urgesOn(addDays(date, -i)));
      const c = this.outcomeCounts(window);
      const answered = c.diverted + c.notDiverted;
      return {
        date,
        divertedPercent: c.divertedPercent,
        notDivertedPercent: c.divertedPercent === null ? null : round1(100 - c.divertedPercent),
        diverted: c.diverted,
        notDiverted: c.notDiverted,
        answered,
      };
    });

    const blockOf = (u: UrgeRecord) => Math.min(7, Math.floor(Number(u.localTime.slice(0, 2)) / 3));
    const timeOfDay = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      for (let block = 0; block < TIME_BLOCKS.length; block++) {
        const cell = urges.filter((u) => weekdayOf(u.localDate) === weekday && blockOf(u) === block);
        timeOfDay.push({ weekday, block, ...this.outcomeCounts(cell) });
      }
    }

    const byIntensity = INTENSITY_BANDS.map((b) => ({
      band: b.key,
      label: b.label,
      ...this.outcomeCounts(urges.filter((u) => u.intensity >= b.min && u.intensity <= b.max)),
    }));
    const triggerOutcomes = group(triggerItems).map((g) => ({ label: g.label, ...this.outcomeCounts(g.urges) }));
    const stats = this.urgeStats(urges);

    return {
      range,
      stats,
      insights: urgeInsights({
        stats,
        chronological,
        timeOfDay,
        byIntensity,
        triggerOutcomes,
        days: dates.length,
        daysWithUrges: dates.filter((d) => this.urgesOn(d).length > 0).length,
        current: run,
        best,
      }),
      rolling,
      timeOfDay,
      byIntensity,
      triggerOutcomes,
      daily: dates.map((date) => {
        const list = this.urgesOn(date);
        const ai = avg(list.map((u) => u.intensity));
        return {
          date,
          count: list.length,
          avgIntensity: ai === null ? null : round1(ai),
          totalDuration: list.reduce((s, u) => s + (u.durationMinutes ?? 0), 0),
          ...this.divertedCounts(list),
        };
      }),
      weekly: [...weeks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, w]) => ({
          weekStart,
          ...w,
          divertedPercent: w.diverted + w.notDiverted ? round1((w.diverted / (w.diverted + w.notDiverted)) * 100) : null,
        })),
      notDivertedBreakdown: breakdown,
      currentDivertedStreak: run,
      bestDivertedStreak: best,
      points: urges
        .slice()
        .reverse()
        .map((u) => ({ date: u.localDate, time: u.localTime.slice(0, 5), intensity: u.intensity, durationMinutes: u.durationMinutes ?? null })),
      triggers: top(triggerItems),
      emotions: top(emotionItems),
      records: urges.map((u) => this.urgeView(u)),
    };
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pctText = (n: number) => `${Math.round(n)}%`;

/**
 * Plain-language summary of a period, for a reader who wants the picture at a glance.
 * Neutral wording; a comparison is only stated when both sides have enough answered
 * urges to mean something.
 */
export function urgeInsights(p: {
  stats: UrgeStats;
  chronological: UrgeRecord[];
  timeOfDay: ({ weekday: number; block: number } & OutcomeCounts)[];
  byIntensity: ({ label: string } & OutcomeCounts)[];
  triggerOutcomes: ({ label: string } & OutcomeCounts)[];
  days: number;
  daysWithUrges: number;
  current: number;
  best: number;
}): string[] {
  const out: string[] = [];
  const { stats } = p;
  if (stats.total === 0) return [`No urges recorded in these ${plural(p.days, 'day')}.`];

  const answered = stats.diverted + stats.notDiverted;
  if (answered > 0) {
    out.push(`${stats.diverted} of ${plural(answered, 'answered urge')} (${pctText(stats.divertedPercent ?? 0)}) were diverted.`);
  }
  if (stats.unanswered > 0) {
    out.push(`${plural(stats.unanswered, 'urge')} didn't have both outcome questions answered, so they aren't counted in the rate.`);
  }

  // Trend: first half vs second half of the answered urges, in time order.
  const ans = p.chronological.filter((u) => urgeDiverted(u) !== null);
  if (ans.length >= 6) {
    const half = Math.floor(ans.length / 2);
    const rate = (xs: UrgeRecord[]) => (xs.filter((u) => urgeDiverted(u)).length / xs.length) * 100;
    const a = rate(ans.slice(0, half));
    const b = rate(ans.slice(half));
    if (b - a >= 10) out.push(`The diverted rate improved from ${pctText(a)} to ${pctText(b)} between the earlier and later urges in this period.`);
    else if (a - b >= 10) out.push(`The diverted rate dropped from ${pctText(a)} to ${pctText(b)} between the earlier and later urges in this period.`);
    else out.push(`The diverted rate stayed about the same through this period (${pctText(a)} → ${pctText(b)}).`);
  }

  if (p.current > 0 || p.best > 1) {
    out.push(`Current run: ${plural(p.current, 'diverted urge')} in a row (longest in this period: ${p.best}).`);
  }

  out.push(`Urges were recorded on ${p.daysWithUrges} of ${plural(p.days, 'day')} (${plural(stats.total, 'urge')} in total).`);

  // Peak time of day and weekday.
  if (stats.total >= 3) {
    const byBlock = TIME_BLOCKS.map((label, block) => ({
      label,
      n: p.timeOfDay.filter((c) => c.block === block).reduce((s, c) => s + c.total, 0),
    }));
    const peak = byBlock.reduce((a, b) => (b.n > a.n ? b : a));
    if (peak.n >= 2 && peak.n / stats.total >= 0.3) {
      out.push(`Urges were most common between ${peak.label} (${peak.n} of ${stats.total}).`);
    }
    const byDay = [1, 2, 3, 4, 5, 6, 7].map((wd) => ({
      wd,
      n: p.timeOfDay.filter((c) => c.weekday === wd).reduce((s, c) => s + c.total, 0),
    }));
    const peakDay = byDay.reduce((a, b) => (b.n > a.n ? b : a));
    if (p.days >= 14 && peakDay.n >= 3 && peakDay.n / stats.total >= 0.25) {
      out.push(`${weekdayName(peakDay.wd, 'long')}s had the most urges (${peakDay.n} of ${stats.total}).`);
    }
  }

  // Intensity: high vs lower.
  const high = p.byIntensity.find((b) => b.label.startsWith('High'));
  const lower = p.byIntensity.filter((b) => !b.label.startsWith('High'));
  const lowerDiv = lower.reduce((s, b) => s + b.diverted, 0);
  const lowerAns = lower.reduce((s, b) => s + b.diverted + b.notDiverted, 0);
  if (high && high.diverted + high.notDiverted >= 2 && lowerAns >= 2) {
    const h = (high.diverted / (high.diverted + high.notDiverted)) * 100;
    const l = (lowerDiv / lowerAns) * 100;
    if (Math.abs(h - l) >= 15) {
      out.push(`High-intensity urges (7–10) were diverted ${pctText(h)} of the time, compared with ${pctText(l)} for lower-intensity urges.`);
    }
  }

  // Hardest trigger: the lowest diverted rate among triggers with enough answers.
  const hard = p.triggerOutcomes
    .filter((t) => t.diverted + t.notDiverted >= 2 && t.divertedPercent !== null && t.divertedPercent < (stats.divertedPercent ?? 0))
    .sort((a, b) => (a.divertedPercent ?? 0) - (b.divertedPercent ?? 0))[0];
  if (hard) {
    out.push(`Urges triggered by “${hard.label}” were the hardest to divert (${hard.diverted} of ${hard.diverted + hard.notDiverted}).`);
  } else if (p.triggerOutcomes[0] && p.triggerOutcomes[0].total >= 2) {
    out.push(`The most common trigger was “${p.triggerOutcomes[0].label}” (${plural(p.triggerOutcomes[0].total, 'time')}).`);
  }
  return out;
}

/** Earlier half vs later half of a series of values, as a short phrase; null if too few. */
function halvesTrend(values: number[], fmt: (n: number) => string, threshold: number, min = 6) {
  if (values.length < min) return null;
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half).reduce((s, x) => s + x, 0) / half;
  const b = values.slice(half).reduce((s, x) => s + x, 0) / (values.length - half);
  if (b - a >= threshold) return { dir: 'up' as const, a: fmt(a), b: fmt(b) };
  if (a - b >= threshold) return { dir: 'down' as const, a: fmt(a), b: fmt(b) };
  return { dir: 'same' as const, a: fmt(a), b: fmt(b) };
}

export function habitInsights(p: {
  series: DaySeriesPoint[];
  completed: number;
  scheduled: number;
  habitBreakdown: { name: string; scheduledDays: number; completionPercent: number | null }[];
}): string[] {
  if (p.scheduled === 0) return ['No habits were scheduled in this period.'];
  const out: string[] = [];
  out.push(`Habits were completed on ${p.completed} of ${plural(p.scheduled, 'scheduled habit-day')} (${pctText((p.completed / p.scheduled) * 100)}).`);

  const withHabits = p.series.filter((s) => s.habitPercent !== null);
  const allDone = withHabits.filter((s) => (s.habitPercent ?? 0) >= 100).length;
  out.push(`Every habit was done on ${allDone} of ${plural(withHabits.length, 'day')} that had habits scheduled.`);

  const t = halvesTrend(withHabits.map((s) => s.habitPercent ?? 0), pctText, 10);
  if (t?.dir === 'up') out.push(`Daily habit completion improved from ${t.a} to ${t.b} over the period.`);
  else if (t?.dir === 'down') out.push(`Daily habit completion dropped from ${t.a} to ${t.b} over the period.`);
  else if (t) out.push(`Daily habit completion held steady (${t.a} → ${t.b}).`);

  const enough = p.habitBreakdown.filter((h) => h.scheduledDays >= 3 && h.completionPercent !== null);
  if (enough.length >= 2) {
    const best = enough[0]!;
    const worst = enough[enough.length - 1]!;
    if ((best.completionPercent ?? 0) - (worst.completionPercent ?? 0) >= 15) {
      out.push(`Most consistent: ${best.name} (${pctText(best.completionPercent!)}). Needs the most support: ${worst.name} (${pctText(worst.completionPercent!)}).`);
    }
  }

  // Link to urges: diverted rate on strong vs weaker habit days.
  const rate = (days: DaySeriesPoint[]) => {
    const d = days.reduce((s, x) => s + x.urgesDiverted, 0);
    const n = days.reduce((s, x) => s + x.urgesNotDiverted, 0);
    return { d, answered: d + n };
  };
  const strong = rate(withHabits.filter((s) => (s.habitPercent ?? 0) >= 80));
  const weak = rate(withHabits.filter((s) => (s.habitPercent ?? 0) < 80));
  if (strong.answered >= 2 && weak.answered >= 2) {
    const a = (strong.d / strong.answered) * 100;
    const b = (weak.d / weak.answered) * 100;
    if (Math.abs(a - b) >= 15) {
      out.push(`On days with 80%+ habit completion, ${pctText(a)} of urges were diverted, compared with ${pctText(b)} on other days.`);
    }
  }
  return out;
}

export function moodInsights(p: { series: DaySeriesPoint[]; days: number }): string[] {
  const withMood = p.series.filter((s) => s.mood !== null);
  if (withMood.length === 0) return ['No mood recorded in this period.'];
  const label = (v: number) => {
    const m = MOOD_OPTIONS.find((o) => o.value === Math.round(v));
    return m ? `${m.emoji} ${m.label}` : '';
  };
  const out: string[] = [];
  const mean = withMood.reduce((s, x) => s + x.mood!, 0) / withMood.length;
  out.push(`Mood was recorded on ${withMood.length} of ${plural(p.days, 'day')}; on average ${label(mean)} (${round1(mean)} of 5).`);

  const counts = MOOD_OPTIONS.map((m) => ({ m, n: withMood.filter((s) => s.mood === m.value).length }));
  const common = counts.reduce((a, b) => (b.n > a.n ? b : a));
  if (withMood.length >= 3) out.push(`Most common mood: ${common.m.emoji} ${common.m.label} (${common.n} of ${withMood.length} days).`);

  const low = withMood.filter((s) => (s.mood ?? 0) <= 2).length;
  if (low > 0) out.push(`${plural(low, 'day')} had a low mood (${MOOD_OPTIONS[0].emoji} or ${MOOD_OPTIONS[1].emoji}).`);

  const t = halvesTrend(withMood.map((s) => s.mood!), (n) => String(round1(n)), 0.5);
  if (t?.dir === 'up') out.push(`Mood improved over the period (${t.a} → ${t.b} of 5).`);
  else if (t?.dir === 'down') out.push(`Mood dipped over the period (${t.a} → ${t.b} of 5).`);
  else if (t) out.push(`Mood held steady over the period (${t.a} → ${t.b} of 5).`);

  // Link to urges: mood on days with a not-diverted urge vs other days.
  const slip = withMood.filter((s) => s.urgesNotDiverted > 0);
  const other = withMood.filter((s) => s.urgesNotDiverted === 0);
  if (slip.length >= 2 && other.length >= 2) {
    const a = slip.reduce((s, x) => s + x.mood!, 0) / slip.length;
    const b = other.reduce((s, x) => s + x.mood!, 0) / other.length;
    if (Math.abs(a - b) >= 0.5) {
      out.push(`Average mood was ${round1(a)} on days with a not-diverted urge, compared with ${round1(b)} on other days.`);
    }
  }
  return out;
}
