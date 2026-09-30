import { describe, expect, it } from 'vitest';
import { CYCLE_SECONDS, DURATIONS, breathStateAt, formatClock, totalSeconds } from './breathing';

describe('breathing exercise timing', () => {
  it('uses a calm 4 s in, 1 s top-up, 7 s out breath', () => {
    expect(CYCLE_SECONDS).toBe(12);
  });

  it('offers 1 and 2 minute sessions, never longer than 2 minutes', () => {
    expect(DURATIONS.map((d) => totalSeconds(d.cycles))).toEqual([60, 120]);
  });

  it('runs inhale -> top-up -> long exhale, then the next breath', () => {
    const c = 10;
    expect(breathStateAt(0, c)).toMatchObject({ cycle: 1, phase: { kind: 'inhale' }, phaseSecondsLeft: 4, totalSecondsLeft: 120, phaseEndMs: 4000 });
    expect(breathStateAt(3999, c).phase.kind).toBe('inhale');
    expect(breathStateAt(4000, c)).toMatchObject({ phase: { kind: 'topup' }, phaseSecondsLeft: 1, phaseEndMs: 5000 });
    expect(breathStateAt(5000, c)).toMatchObject({ phase: { kind: 'exhale' }, phaseSecondsLeft: 7, phaseEndMs: 12000 });
    expect(breathStateAt(11500, c)).toMatchObject({ phase: { kind: 'exhale' }, phaseSecondsLeft: 1 });
    expect(breathStateAt(12000, c)).toMatchObject({ cycle: 2, phase: { kind: 'inhale' }, phaseEndMs: 16000 });
  });

  it('ends exactly at the chosen length', () => {
    expect(breathStateAt(59_999, 5)).toMatchObject({ done: false, phase: { kind: 'exhale' } });
    expect(breathStateAt(60_000, 5)).toMatchObject({ done: true, totalSecondsLeft: 0 });
    expect(breathStateAt(120_000, 10).done).toBe(true);
  });

  it('formats the countdown', () => {
    expect(formatClock(120)).toBe('2:00');
    expect(formatClock(9)).toBe('0:09');
  });
});
