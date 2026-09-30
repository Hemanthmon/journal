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
