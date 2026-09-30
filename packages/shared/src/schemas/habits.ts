import { z } from 'zod';
import {
  baseRecordShape,
  decimal2,
  displayOrderSchema,
  idSchema,
  isoDateTimeSchema,
  localDateSchema,
  type WithSeq,
} from './common';
import type { Weekday } from '../schedule';

export const MEASUREMENT_TYPES = ['boolean', 'count', 'duration', 'quantity'] as const;
export const measurementTypeSchema = z.enum(MEASUREMENT_TYPES);
export type MeasurementType = z.infer<typeof measurementTypeSchema>;

/** Durations are always entered in minutes. */
export const DURATION_UNIT = 'minutes';

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  boolean: 'Yes / No',
  count: 'Count',
  duration: 'Duration (minutes)',
  quantity: 'Quantity',
};

const nameField = z.string().trim().min(1, 'Name is required').max(100);
const descriptionField = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((v) => v || null);
const unitField = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .transform((v) => v || null);
export const scheduleDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, 'Choose at least one day')
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b) as Weekday[]);
const targetField = decimal2.refine((v) => v > 0, 'Target must be greater than 0');

/**
 * A complete habit record — what the app stores and syncs. Create requests and
 * merged (existing + patch) updates are both validated against this.
 */
export const habitRecordSchema = z
  .object({
    ...baseRecordShape,
    name: nameField,
    description: descriptionField,
    measurementType: measurementTypeSchema,
    targetValue: targetField,
    unit: unitField,
    scheduleDays: scheduleDaysSchema,
    isActive: z.boolean(),
    archivedAt: isoDateTimeSchema.nullable(),
    displayOrder: displayOrderSchema,
  })
  .superRefine((h, ctx) => {
    if (h.measurementType === 'boolean' && h.targetValue !== 1) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Yes/no habits have a target of 1' });
    }
    if (h.measurementType === 'quantity' && !h.unit) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Quantity habits need a unit (e.g. litres)' });
    }
  })
  .transform((h) => ({
    ...h,
    // Yes/no habits have no unit; durations are always minutes.
    unit: h.measurementType === 'boolean' ? null : h.measurementType === 'duration' ? DURATION_UNIT : h.unit,
  }));
export type HabitRecord = z.output<typeof habitRecordSchema>;
export type Habit = WithSeq<HabitRecord>;

export const createHabitSchema = z
  .object({
    /** Optional client-generated id. Retrying a create with the same id is safe. */
    id: idSchema.optional(),
    name: z.string(),
    description: z.string().nullable().optional(),
    measurementType: measurementTypeSchema,
    /** Optional for yes/no habits (always 1). */
    targetValue: z.number().optional(),
    unit: z.string().nullable().optional(),
    /** ISO weekdays, 1 = Monday ... 7 = Sunday. Defaults to every day. */
    scheduleDays: z.array(z.number()).optional(),
    isActive: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict();
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    measurementType: measurementTypeSchema.optional(),
    targetValue: z.number().optional(),
    unit: z.string().nullable().optional(),
    scheduleDays: z.array(z.number()).optional(),
    isActive: z.boolean().optional(),
    archived: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

/** Daily progress for one habit. The target/unit/type are snapshots taken when first logged. */
export const habitLogRecordSchema = z
  .object({
    ...baseRecordShape,
    habitId: idSchema,
    localDate: localDateSchema,
    value: decimal2,
    targetSnapshot: targetField,
    unitSnapshot: unitField,
    typeSnapshot: measurementTypeSchema,
  })
  .superRefine((l, ctx) => {
    if (l.typeSnapshot === 'boolean' && l.value !== 0 && l.value !== 1) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Yes/no habits are 0 or 1' });
    }
  });
export type HabitLogRecord = z.output<typeof habitLogRecordSchema>;
export type HabitLog = WithSeq<HabitLogRecord>;

export const createHabitLogSchema = z
  .object({
    habitId: idSchema,
    localDate: localDateSchema,
    value: decimal2,
  })
  .strict();
export type CreateHabitLogInput = z.infer<typeof createHabitLogSchema>;

export const updateHabitLogSchema = z.object({ value: decimal2 }).strict();

export const habitLogQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    habitId: idSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '`from` must not be after `to`', path: ['from'] });
