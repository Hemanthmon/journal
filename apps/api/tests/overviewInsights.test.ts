import { describe, expect, it } from 'vitest';
import type { DaySeriesPoint } from '@journal/shared';
import { habitInsights, moodInsights } from '../src/modules/dashboard/analytics';

/** Plain-language habit and mood summaries on the overview (pure; no database). */

const day = (i: number, p: Partial<DaySeriesPoint>): DaySeriesPoint => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  habitPercent: null,
  mood: null,
  journal: false,
  urges: 0,
  urgesDiverted: 0,
  urgesNotDiverted: 0,
  urgesUnanswered: 0,
  ...p,
});

describe('habit insights', () => {
  it('says so when nothing was scheduled', () => {
    expect(habitInsights({ series: [], completed: 0, scheduled: 0, habitBreakdown: [] })).toEqual([
      'No habits were scheduled in this period.',
    ]);
  });

  it('summarises completion, trend, best/weakest habit and the link to urges', () => {
    const pcts = [20, 30, 40, 100, 100, 100];
    const series = pcts.map((habitPercent, i) =>
      day(i, {
        habitPercent,
        // Strong days: urges diverted; weak days: not diverted.
        urgesDiverted: habitPercent >= 80 ? 1 : 0,
        urgesNotDiverted: habitPercent < 80 ? 1 : 0,
      }),
    );
    const out = habitInsights({
      series,
      completed: 9,
      scheduled: 12,
      habitBreakdown: [
        { name: 'Wake early', scheduledDays: 6, completionPercent: 100 },
        { name: 'Exercise', scheduledDays: 6, completionPercent: 50 },
      ],
    });
    expect(out).toEqual([
      'Habits were completed on 9 of 12 scheduled habit-days (75%).',
      'Every habit was done on 3 of 6 days that had habits scheduled.',
      'Daily habit completion improved from 30% to 100% over the period.',
      'Most consistent: Wake early (100%). Needs the most support: Exercise (50%).',
      'On days with 80%+ habit completion, 100% of urges were diverted, compared with 0% on other days.',
    ]);
  });
});

describe('mood insights', () => {
  it('says so when no mood was recorded', () => {
    expect(moodInsights({ series: [day(0, {})], days: 1 })).toEqual(['No mood recorded in this period.']);
  });

  it('summarises average, most common, low days, trend and the link to urges', () => {
    const moods = [2, 2, 3, 4, 4, 5];
    const series = moods.map((mood, i) => day(i, { mood, urgesNotDiverted: mood <= 2 ? 1 : 0 }));
    const out = moodInsights({ series: [...series, day(6, {})], days: 7 });
    expect(out).toEqual([
      'Mood was recorded on 6 of 7 days; on average 😐 Okay (3.3 of 5).',
      'Most common mood: 😟 Not great (2 of 6 days).',
      '2 days had a low mood (😢 or 😟).',
      'Mood improved over the period (2.3 → 4.3 of 5).',
      'Average mood was 2 on days with a not-diverted urge, compared with 4 on other days.',
    ]);
  });
});
