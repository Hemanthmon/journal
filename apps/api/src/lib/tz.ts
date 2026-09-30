/** Wall-clock parts of an instant in an IANA time zone. */
function parts(instant: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Local calendar date ("YYYY-MM-DD") of an instant in `timeZone`. */
export const localDateIn = (instant: Date, timeZone: string) => parts(instant, timeZone).date;

/** Local wall-clock time ("HH:MM") of an instant in `timeZone`. */
export const localTimeIn = (instant: Date, timeZone: string) => parts(instant, timeZone).time;

/** "2026-09-30 21:05" in `timeZone`. */
export function localDateTimeIn(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${p.date} ${p.time}`;
}

/** Falls back to UTC if the stored zone is unknown to this runtime. */
export function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}
