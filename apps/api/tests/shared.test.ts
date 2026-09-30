import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dailyRoutineId,
  daysToMask,
  formatTime12,
  from12Hour,
  habitLogId,
  habitProgress,
  isScheduledOn,
  maskToDays,
  sha1,
  to12Hour,
  uuidv5,
  weekdayOf,
} from '@journal/shared';

describe('habit progress', () => {
  it('computes partial progress as value / target * 100', () => {
    expect(habitProgress('duration', 15, 30)).toBe(50);
    expect(habitProgress('count', 3, 10)).toBeCloseTo(30);
    expect(habitProgress('quantity', 1.5, 2)).toBe(75);
  });

  it('caps displayed progress at 100% without changing the value', () => {
    expect(habitProgress('duration', 45, 30)).toBe(100);
  });

  it('treats boolean habits as 0% or 100%', () => {
    expect(habitProgress('boolean', 1, 1)).toBe(100);
    expect(habitProgress('boolean', 0, 1)).toBe(0);
  });

  it('never divides by zero or goes negative', () => {
    expect(habitProgress('count', 5, 0)).toBe(0);
    expect(habitProgress('count', 0, 10)).toBe(0);
  });
});

describe('schedules', () => {
  it('round-trips weekday arrays through the bitmask', () => {
    expect(daysToMask([1, 2, 3, 4, 5, 6, 7])).toBe(127);
    expect(daysToMask([1])).toBe(1);
    expect(daysToMask([7])).toBe(64);
    expect(maskToDays(daysToMask([1, 3, 5]))).toEqual([1, 3, 5]);
  });

  it('knows which dates a habit is scheduled on (Mon-Sat example)', () => {
    const monToSat = [1, 2, 3, 4, 5, 6];
    expect(weekdayOf('2026-09-28')).toBe(1); // Monday
    expect(isScheduledOn(monToSat, '2026-10-03')).toBe(true); // Saturday
    expect(isScheduledOn(monToSat, '2026-10-04')).toBe(false); // Sunday
  });

  it('does date arithmetic without time zone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('12-hour times (AM/PM)', () => {
  it('formats stored 24-hour times for display', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('00:30:00')).toBe('12:30 AM');
    expect(formatTime12('09:46:00')).toBe('9:46 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('15:05:00')).toBe('3:05 PM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
  });

  it('parses typed 12-hour times', () => {
    expect(from12Hour('12:00', 'AM')).toBe('00:00');
    expect(from12Hour('12:15', 'PM')).toBe('12:15');
    expect(from12Hour('3', 'PM')).toBe('15:00');
    expect(from12Hour('3:05', 'PM')).toBe('15:05');
    expect(from12Hour('09:46', 'AM')).toBe('09:46');
    expect(from12Hour('930', 'PM')).toBe('21:30');
    expect(from12Hour('7.15', 'AM')).toBe('07:15');
  });

  it('rejects invalid 12-hour times', () => {
    for (const bad of ['0:30', '13:00', '3:60', '', 'abc', '3:5']) expect(from12Hour(bad, 'AM')).toBeNull();
  });

  it('round-trips every minute of the day', () => {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const { time, period } = to12Hour(t);
        expect(from12Hour(time, period)).toBe(t);
      }
    }
  });
});

describe('deterministic ids', () => {
  it('implements SHA-1 correctly', () => {
    for (const s of ['', 'abc', 'a'.repeat(1000), 'journal ✓ 😄']) {
      const expected = createHash('sha1').update(s).digest('hex');
      expect(Buffer.from(sha1(new TextEncoder().encode(s))).toString('hex')).toBe(expected);
    }
  });

  it('matches the RFC 4122 UUIDv5 reference value', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('gives the same id for the same user/day and different ids otherwise', () => {
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    expect(dailyRoutineId(u1, '2026-09-29')).toBe(dailyRoutineId(u1, '2026-09-29'));
    expect(dailyRoutineId(u1, '2026-09-29')).not.toBe(dailyRoutineId(u2, '2026-09-29'));
    expect(habitLogId(u1, u2, '2026-09-29')).not.toBe(habitLogId(u1, u2, '2026-09-30'));
  });
});
