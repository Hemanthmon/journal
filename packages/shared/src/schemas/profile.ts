import { z } from 'zod';
import { nameSchema, timezoneSchema } from './auth';

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Destructive account actions require the current password. */
export const confirmPasswordSchema = z.object({ password: z.string().min(1, 'Password is required').max(200) }).strict();
