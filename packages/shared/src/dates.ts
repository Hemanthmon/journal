/**
 * Local calendar dates are plain "YYYY-MM-DD" strings. Arithmetic is done in UTC on
 * those strings, so results never shift with the device's time zone or DST.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** The device-local calendar date of an instant. */
export function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The device-local wall-clock time of an instant, "HH:MM". */
export function toLocalTime(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1 = Monday ... 7 = Sunday */
export function weekdayName(isoWeekday: number, style: 'short' | 'long' = 'short'): string {
  return (style === 'short' ? WEEKDAY_SHORT : WEEKDAY_LONG)[isoWeekday - 1] ?? '';
}

/** "Tuesday, 29 Sep 2026" */
export function formatLongDate(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return `${weekdayName(wd, 'long')}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "29 Sep" */
export function formatShortDate(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
