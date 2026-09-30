/**
 * Weekdays use ISO numbering: 1 = Monday ... 7 = Sunday.
 * The database stores a schedule as a bitmask (Monday = 1, Tuesday = 2, ... Sunday = 64).
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function daysToMask(days: readonly number[]): number {
  return days.reduce((mask, d) => mask | (1 << (d - 1)), 0);
}

export function maskToDays(mask: number): Weekday[] {
  return ALL_WEEKDAYS.filter((d) => (mask & (1 << (d - 1))) !== 0);
}

/** ISO weekday of a local calendar date string ("YYYY-MM-DD"), independent of the device time zone. */
export function weekdayOf(localDate: string): Weekday {
  const jsDay = new Date(`${localDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (jsDay === 0 ? 7 : jsDay) as Weekday;
}

export function isScheduledOn(scheduleDays: readonly number[], localDate: string): boolean {
  return scheduleDays.includes(weekdayOf(localDate));
}
