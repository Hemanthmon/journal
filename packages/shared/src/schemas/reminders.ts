import { z } from 'zod';
import { baseRecordShape, displayOrderSchema, type WithSeq } from './common';

/** A short personal reminder the user wants to see every day on the dashboard. */
export const reminderRecordSchema = z.object({
  ...baseRecordShape,
  text: z.string().trim().min(1, 'Write a reminder').max(200, 'Keep it under 200 characters'),
  isActive: z.boolean(),
  displayOrder: displayOrderSchema,
});
export type ReminderRecord = z.output<typeof reminderRecordSchema>;
export type Reminder = WithSeq<ReminderRecord>;
