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

export type Meridiem = 'AM' | 'PM';

/**
 * Splits a stored 24-hour time ("HH:MM" or "HH:MM:SS") into 12-hour parts:
 * "15:05" -> { time: "3:05", period: "PM" }, "00:30" -> { time: "12:30", period: "AM" }.
 */
export function to12Hour(hhmm: string): { time: string; period: Meridiem } {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const period: Meridiem = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return { time: `${hour}:${pad(m)}`, period };
}

/** "15:05:00" -> "3:05 PM". Times are always stored in 24-hour form; this is for display. */
export function formatTime12(hhmm: string): string {
  const { time, period } = to12Hour(hhmm);
  return `${time} ${period}`;
}

/**
 * Parses a 12-hour time typed by the user plus AM/PM into 24-hour "HH:MM".
 * Accepts "3", "3:05", "03:05", "3.05" and "305"; returns null if it isn't a valid time.
 */
export function from12Hour(input: string, period: Meridiem): string | null {
  const s = input.trim().replace('.', ':');
  let h: number;
  let m: number;
  const colon = /^(\d{1,2})(?::(\d{2}))?$/.exec(s);
  const compact = /^(\d{1,2})(\d{2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]);
    m = colon[2] === undefined ? 0 : Number(colon[2]);
  } else if (compact) {
    h = Number(compact[1]);
    m = Number(compact[2]);
  } else {
    return null;
  }
  if (h < 1 || h > 12 || m > 59) return null;
  const h24 = period === 'AM' ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${pad(h24)}:${pad(m)}`;
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
