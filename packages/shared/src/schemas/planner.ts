import { z } from 'zod';
import { addDays } from '../dates';
import { weekdayOf } from '../schedule';
import {
  baseRecordShape,
  displayOrderSchema,
  idSchema,
  isoDateTimeSchema,
  localDateSchema,
  localTimeSchema,
  optionalText,
  type WithSeq,
} from './common';

/**
 * Planner built on Atomic Habits: every task is a small "vote" for the person you want
 * to become (an identity), made obvious with a time and place and easy with a two-minute
 * starter. Monthly focuses break into weekly goals, which break into daily tasks; each
 * week and month ends with a short review.
 */

/** "I am a reader." The kind of person the user is becoming. */
export const identityRecordSchema = z.object({
  ...baseRecordShape,
  statement: z.string().trim().min(1, 'Write who you are becoming').max(120, 'Keep it under 120 characters'),
  isActive: z.boolean(),
  displayOrder: displayOrderSchema,
});
export type IdentityRecord = z.output<typeof identityRecordSchema>;
export type Identity = WithSeq<IdentityRecord>;

export const PLAN_LEVELS = ['month', 'week'] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

/** First day of the month, or the Monday that starts the week. */
export function isPeriodStart(level: PlanLevel, localDate: string): boolean {
  return level === 'month' ? localDate.endsWith('-01') : weekdayOf(localDate) === 1;
}

/** The Monday on or before `localDate`. */
export function weekStartOf(localDate: string): string {
  return addDays(localDate, 1 - weekdayOf(localDate));
}

export function monthStartOf(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

export function periodStartOf(level: PlanLevel, localDate: string): string {
  return level === 'month' ? monthStartOf(localDate) : weekStartOf(localDate);
}

/** Last day of the period that starts on `periodStart`. */
export function periodEnd(level: PlanLevel, periodStart: string): string {
  if (level === 'week') return addDays(periodStart, 6);
  const [y, m] = periodStart.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

export function shiftPeriod(level: PlanLevel, periodStart: string, by: number): string {
  if (level === 'week') return addDays(periodStart, 7 * by);
  const [y, m] = periodStart.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

const periodShape = {
  level: z.enum(PLAN_LEVELS),
  periodStart: localDateSchema,
};

function checkPeriod(v: { level: PlanLevel; periodStart: string }, ctx: z.RefinementCtx) {
  if (!isPeriodStart(v.level, v.periodStart)) {
    ctx.addIssue({
      code: 'custom',
      path: ['periodStart'],
      message: v.level === 'month' ? 'A month starts on day 1' : 'A week starts on Monday',
    });
  }
}

/** A monthly focus, or a weekly goal (optionally serving a monthly focus via parentId). */
export const planGoalRecordSchema = z
  .object({
    ...baseRecordShape,
    ...periodShape,
    text: z.string().trim().min(1, 'Write a goal').max(200, 'Keep it under 200 characters'),
    identityId: idSchema.nullable(),
    parentId: idSchema.nullable(),
    doneAt: isoDateTimeSchema.nullable(),
    displayOrder: displayOrderSchema,
  })
  .superRefine(checkPeriod);
export type PlanGoalRecord = z.output<typeof planGoalRecordSchema>;

/** One thing to do on one day. */
export const planTaskRecordSchema = z.object({
  ...baseRecordShape,
  title: z.string().trim().min(1, 'Write a task').max(200, 'Keep it under 200 characters'),
  localDate: localDateSchema,
  identityId: idSchema.nullable(),
  /** The weekly goal this task moves forward. */
  goalId: idSchema.nullable(),
  /** Implementation intention: "I will … at [time] in [place]". */
  localTime: localTimeSchema.nullable(),
  place: optionalText(100),
  /** The two-minute version that makes starting easy. */
  twoMinute: optionalText(200),
  completedAt: isoDateTimeSchema.nullable(),
  displayOrder: displayOrderSchema,
});
export type PlanTaskRecord = z.output<typeof planTaskRecordSchema>;

/** End-of-week or end-of-month reflection; one per period (deterministic id). */
export const planReviewRecordSchema = z
  .object({
    ...baseRecordShape,
    ...periodShape,
    wentWell: optionalText(2000),
    makeEasier: optionalText(2000),
    onePercent: optionalText(2000),
  })
  .superRefine(checkPeriod);
export type PlanReviewRecord = z.output<typeof planReviewRecordSchema>;

/** Calm colour names for calendar blocks; each app maps them to its own palette. */
export const BLOCK_COLORS = ['sage', 'sky', 'lavender', 'peach', 'rose', 'sand'] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number];

/**
 * A time block on the calendar, like a Google Calendar event: "Deep work 9–11 AM".
 * Blocks can come from the app, the website, or (when connected) Google Calendar.
 */
export const timeBlockRecordSchema = z
  .object({
    ...baseRecordShape,
    title: z.string().trim().min(1, 'Give the block a name').max(200, 'Keep it under 200 characters'),
    localDate: localDateSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    color: z.enum(BLOCK_COLORS),
    identityId: idSchema.nullable(),
    notes: optionalText(2000),
  })
  .refine((b) => b.endTime > b.startTime, { message: 'The block must end after it starts', path: ['endTime'] });
export type TimeBlockRecord = z.output<typeof timeBlockRecordSchema>;
