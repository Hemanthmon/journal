import { z } from 'zod';
import {
  baseRecordShape,
  idSchema,
  isoDateTimeSchema,
  localDateSchema,
  localTimeSchema,
  optionalText,
  type WithSeq,
} from './common';

const urgeFields = {
  /** UTC instant the urge happened (the automatic timestamp). */
  occurredAt: isoDateTimeSchema,
  /** User's local calendar date and time of the urge. The weekday is derived from localDate. */
  localDate: localDateSchema,
  localTime: localTimeSchema,
  triggerText: optionalText(1000),
  intensity: z.number().int().min(0, 'Intensity is 0–10').max(10, 'Intensity is 0–10'),
  /**
   * How long the urge lasted, in whole minutes; null = not recorded. Optional on the wire
   * so app versions from before this field can still sync (the server keeps the stored
   * value when a record arrives without it).
   */
  durationMinutes: z
    .number()
    .int('Duration must be whole minutes')
    .min(0, 'Duration is 0–1440 minutes')
    .max(1440, 'Duration is 0–1440 minutes')
    .nullable()
    .optional(),
  actionTaken: optionalText(10_000),
  outcome: optionalText(10_000),
  emotionBefore: optionalText(255),
  /** null = not answered */
  masturbated: z.boolean().nullable(),
  explicitContent: z.boolean().nullable(),
  remarks: optionalText(10_000),
};

export const urgeRecordSchema = z.object({ ...baseRecordShape, ...urgeFields });
export type UrgeRecord = z.output<typeof urgeRecordSchema>;
export type Urge = WithSeq<UrgeRecord>;

export const createUrgeSchema = z
  .object({
    id: idSchema.optional(),
    occurredAt: isoDateTimeSchema.optional(),
    localDate: urgeFields.localDate,
    localTime: urgeFields.localTime,
    triggerText: urgeFields.triggerText.optional(),
    intensity: urgeFields.intensity,
    durationMinutes: urgeFields.durationMinutes,
    actionTaken: urgeFields.actionTaken.optional(),
    outcome: urgeFields.outcome.optional(),
    emotionBefore: urgeFields.emotionBefore.optional(),
    masturbated: urgeFields.masturbated.optional(),
    explicitContent: urgeFields.explicitContent.optional(),
    remarks: urgeFields.remarks.optional(),
  })
  .strict();
export type CreateUrgeInput = z.infer<typeof createUrgeSchema>;

export const updateUrgeSchema = z
  .object({
    occurredAt: isoDateTimeSchema.optional(),
    localDate: urgeFields.localDate.optional(),
    localTime: urgeFields.localTime.optional(),
    triggerText: urgeFields.triggerText.optional(),
    intensity: urgeFields.intensity.optional(),
    durationMinutes: urgeFields.durationMinutes,
    actionTaken: urgeFields.actionTaken.optional(),
    outcome: urgeFields.outcome.optional(),
    emotionBefore: urgeFields.emotionBefore.optional(),
    masturbated: urgeFields.masturbated.optional(),
    explicitContent: urgeFields.explicitContent.optional(),
    remarks: urgeFields.remarks.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
export type UpdateUrgeInput = z.infer<typeof updateUrgeSchema>;

export const urgeQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '`from` must not be after `to`', path: ['from'] });

/** Duration choices offered in the app's picker, in minutes (0 = lasted only seconds). */
export const URGE_DURATION_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180] as const;

/** "Less than a minute", "5 min", "1 hr", "1 hr 30 min", or "—" when not recorded. */
export function formatUrgeDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes === 0) return 'Less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
