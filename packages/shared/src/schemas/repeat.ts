import { z } from 'zod';
import { addDays } from '../dates';
import { weekdayOf } from '../schedule';
import { seriesInstanceId } from '../uuid';
import { baseRecordShape, idSchema, localDateSchema, localTimeSchema, optionalText } from './common';
import { scheduleDaysSchema } from './habits';
import { BLOCK_COLORS } from './planner';

/**
 * Repeating blocks and tasks, like Google Calendar: a series says what repeats and when;
 * each day's occurrence is an ordinary block or task with a deterministic id
 * (`seriesInstanceId`), so every device, the website and the server create the same
 * occurrence, and an occurrence can be ticked off, edited or deleted on its own. A
 * deleted occurrence stays deleted (its tombstone keeps the id), so it isn't recreated.
 */

export const REPEAT_FREQUENCIES = ['daily', 'weekly', 'custom'] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

export const repeatSeriesRecordSchema = z
  .object({
    ...baseRecordShape,
    kind: z.enum(['block', 'task']),
    title: z.string().trim().min(1, 'Give it a name').max(200, 'Keep it under 200 characters'),
    startDate: localDateSchema,
    /** Last day it can occur; null = forever. */
    endDate: localDateSchema.nullable(),
    frequency: z.enum(REPEAT_FREQUENCIES),
    /** Weekdays it occurs on (daily = all seven, weekly = the start day). */
    days: scheduleDaysSchema,
    /** Blocks: start and end. Tasks: optional time (start only). */
    startTime: localTimeSchema.nullable(),
    endTime: localTimeSchema.nullable(),
    color: z.enum(BLOCK_COLORS).nullable(),
    identityId: idSchema.nullable(),
    notes: optionalText(2000),
    place: optionalText(100),
    twoMinute: optionalText(200),
  })
  .superRefine((s, ctx) => {
    if (s.endDate && s.endDate < s.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'It must end on or after the day it starts' });
    }
    if (s.kind === 'block') {
      if (!s.startTime || !s.endTime || !s.color) {
        ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'A repeating block needs a start, an end and a colour' });
      } else if (s.endTime <= s.startTime) {
        ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The block must end after it starts' });
      }
    }
  });
export type RepeatSeriesRecord = z.output<typeof repeatSeriesRecordSchema>;


/** Days in [from, to] on which the series occurs. */
export function seriesDates(s: Pick<RepeatSeriesRecord, 'startDate' | 'endDate' | 'frequency' | 'days'>, from: string, to: string): string[] {
  const start = s.startDate > from ? s.startDate : from;
  const end = s.endDate && s.endDate < to ? s.endDate : to;
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (s.frequency === 'daily' || s.days.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** The fields of the block or task the series creates on `localDate`. */
export function occurrenceOf(s: RepeatSeriesRecord, userId: string, localDate: string, createdAt: string) {
  const base = { id: seriesInstanceId(userId, s.id, localDate), createdAt, updatedAt: createdAt, deletedAt: null, seriesId: s.id, localDate };
  if (s.kind === 'block') {
    return {
      kind: 'block' as const,
      record: { ...base, title: s.title, startTime: s.startTime!, endTime: s.endTime!, color: s.color!, identityId: s.identityId, notes: s.notes },
    };
  }
  return {
    kind: 'task' as const,
    record: {
      ...base,
      title: s.title,
      identityId: s.identityId,
      goalId: null,
      localTime: s.startTime,
      place: s.place,
      twoMinute: s.twoMinute,
      completedAt: null,
      displayOrder: 0,
    },
  };
}

/** Plain-English summary: "Every day", "Every Monday", "Mon, Wed, Fri". */
export function describeRepeat(s: Pick<RepeatSeriesRecord, 'frequency' | 'days' | 'endDate'>, dayName: (w: number) => string): string {
  const what =
    s.frequency === 'daily' || s.days.length === 7
      ? 'Every day'
      : s.days.join() === '1,2,3,4,5'
        ? 'Every weekday'
        : s.frequency === 'weekly' && s.days.length === 1
          ? `Every ${dayName(s.days[0]!)}`
          : s.days.map((d) => dayName(d).slice(0, 3)).join(', ');
  return s.endDate ? `${what}, until ${s.endDate}` : what;
}
