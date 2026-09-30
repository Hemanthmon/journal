import { describe, expect, it } from 'vitest';
import { urgeDiverted, type UrgeRecord } from '@journal/shared';
import { Analyzer, type OwnerData } from '../src/modules/dashboard/analytics';

/** Diverted-urge analytics (pure; no database). */

const T = '2026-09-01T00:00:00.000Z';
let n = 0;
const urge = (localDate: string, masturbated: boolean | null, explicitContent: boolean | null): UrgeRecord => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  occurredAt: T,
  localDate,
  localTime: `1${n % 10}:00:00`,
  triggerText: null,
  intensity: 5,
  durationMinutes: null,
  actionTaken: null,
  outcome: null,
  emotionBefore: null,
  masturbated,
  explicitContent,
  remarks: null,
});

const data = (urges: UrgeRecord[]): OwnerData => ({
  timezone: 'Asia/Kolkata',
  today: '2026-09-27',
  habits: [],
  logs: [],
  routines: [],
  answers: [],
  questions: [],
  urges,
});

describe('urgeDiverted', () => {
  it('is true only when both answers are No, false when either is Yes', () => {
    expect(urgeDiverted({ masturbated: false, explicitContent: false })).toBe(true);
    expect(urgeDiverted({ masturbated: true, explicitContent: false })).toBe(false);
    expect(urgeDiverted({ masturbated: false, explicitContent: true })).toBe(false);
    expect(urgeDiverted({ masturbated: null, explicitContent: true })).toBe(false);
    expect(urgeDiverted({ masturbated: false, explicitContent: null })).toBe(null);
    expect(urgeDiverted({ masturbated: null, explicitContent: null })).toBe(null);
  });
});

describe('diverted urge analytics', () => {
  // Chronological: D, D, X(watched), ?(unanswered), D, D, D, X(both), D
  const urges = [
    urge('2026-09-14', false, false),
    urge('2026-09-15', false, false),
    urge('2026-09-15', false, true),
    urge('2026-09-16', null, null),
    urge('2026-09-17', false, false),
    urge('2026-09-22', false, false),
    urge('2026-09-22', false, false),
    urge('2026-09-23', true, true),
    urge('2026-09-26', false, false),
  ];
  const a = new Analyzer(data(urges));
  const range = { from: '2026-09-14', to: '2026-09-27', days: 14 };
  const u = a.urgeAnalytics(range);

  it('counts outcomes and leaves unanswered urges out of the rate', () => {
    expect(u.stats).toMatchObject({ total: 9, diverted: 6, notDiverted: 2, unanswered: 1, divertedPercent: 75 });
    expect(u.notDivertedBreakdown).toEqual({ watchedOnly: 1, masturbatedOnly: 0, both: 1 });
  });

  it('tracks current and best runs of diverted urges', () => {
    expect(u.currentDivertedStreak).toBe(1);
    // D D X [?] D D D X D: the unanswered urge doesn't break the run of 3.
    expect(u.bestDivertedStreak).toBe(3);
  });

  it('includes every day and week in the range, with 0 where there were no urges', () => {
    expect(u.daily).toHaveLength(14);
    expect(u.daily.find((d) => d.date === '2026-09-20')).toMatchObject({ count: 0, diverted: 0, notDiverted: 0, unanswered: 0 });
    expect(u.daily.find((d) => d.date === '2026-09-15')).toMatchObject({ count: 2, diverted: 1, notDiverted: 1 });
    expect(u.weekly).toEqual([
      { weekStart: '2026-09-14', diverted: 3, notDiverted: 1, divertedPercent: 75 },
      { weekStart: '2026-09-21', diverted: 3, notDiverted: 1, divertedPercent: 75 },
    ]);
    const empty = a.urgeAnalytics({ from: '2026-09-28', to: '2026-10-11', days: 14 });
    expect(empty.weekly).toEqual([
      { weekStart: '2026-09-28', diverted: 0, notDiverted: 0, divertedPercent: null },
      { weekStart: '2026-10-05', diverted: 0, notDiverted: 0, divertedPercent: null },
    ]);
  });

  it('builds the pattern views: rolling rate, time of day, intensity and triggers', () => {
    // 7 days to 09-20: 09-14..09-20 → D, D, X (the unanswered one is left out) + D on 09-17.
    expect(u.rolling.find((d) => d.date === '2026-09-20')).toEqual({
      date: '2026-09-20',
      divertedPercent: 75,
      notDivertedPercent: 25,
      diverted: 3,
      notDiverted: 1,
      answered: 4,
    });
    expect(u.rolling.find((d) => d.date === '2026-09-14')).toMatchObject({ divertedPercent: 100, answered: 1 });

    expect(u.timeOfDay).toHaveLength(56);
    expect(u.timeOfDay.reduce((s, c) => s + c.total, 0)).toBe(9);

    expect(u.byIntensity.map((b) => [b.band, b.total])).toEqual([['low', 0], ['medium', 9], ['high', 0]]);
    expect(u.byIntensity[1]).toMatchObject({ diverted: 6, notDiverted: 2, unanswered: 1, divertedPercent: 75 });
    expect(u.triggerOutcomes).toEqual([]);
  });

  it('writes plain-language insights', () => {
    expect(u.insights[0]).toBe('6 of 8 answered urges (75%) were diverted.');
    expect(u.insights).toContain("1 urge didn't have both outcome questions answered, so they aren't counted in the rate.");
    expect(u.insights).toContain('Current run: 1 diverted urge in a row (longest in this period: 3).');
    expect(u.insights).toContain('Urges were recorded on 7 of 14 days (9 urges in total).');
    expect(a.urgeAnalytics({ from: '2026-09-28', to: '2026-10-04', days: 7 }).insights).toEqual(['No urges recorded in these 7 days.']);
  });

  it('points out the hardest trigger and high-intensity differences', () => {
    const mk = (date: string, intensity: number, trigger: string, slip: boolean) => ({
      ...urge(date, slip, false),
      intensity,
      triggerText: trigger,
    });
    const b = new Analyzer(
      data([
        mk('2026-09-21', 9, 'Late night phone', true),
        mk('2026-09-22', 8, 'Late night phone', true),
        mk('2026-09-23', 8, 'late night phone', false),
        mk('2026-09-24', 2, 'Boredom', false),
        mk('2026-09-25', 3, 'Boredom', false),
        mk('2026-09-26', 4, 'Boredom', false),
      ]),
    ).urgeAnalytics({ from: '2026-09-21', to: '2026-09-27', days: 7 });
    // Equal counts sort alphabetically; spellings are grouped case-insensitively.
    expect(b.triggerOutcomes.map((t) => t.label)).toEqual(['Boredom', 'Late night phone']);
    expect(b.triggerOutcomes[1]).toMatchObject({ total: 3, diverted: 1, notDiverted: 2, divertedPercent: 33.3 });
    expect(b.insights).toContain('Urges triggered by “Late night phone” were the hardest to divert (1 of 3).');
    expect(b.insights).toContain('High-intensity urges (7–10) were diverted 33% of the time, compared with 100% for lower-intensity urges.');
    expect(b.insights).toContain('The diverted rate improved from 33% to 100% between the earlier and later urges in this period.');
  });

  it('marks each record and splits the overview series by outcome', () => {
    expect(u.records.find((r) => r.localDate === '2026-09-23')?.diverted).toBe(false);
    expect(u.records.find((r) => r.localDate === '2026-09-16')?.diverted).toBe(null);
    const o = a.overview(range);
    expect(o.series.find((s) => s.date === '2026-09-15')).toMatchObject({ urges: 2, urgesDiverted: 1, urgesNotDiverted: 1, urgesUnanswered: 0 });
    expect(o.series.find((s) => s.date === '2026-09-20')).toMatchObject({ urges: 0, urgesDiverted: 0, urgesNotDiverted: 0 });
  });
});
