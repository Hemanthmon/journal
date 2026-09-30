import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** bcrypt only uses the first 72 bytes, so cap the length well before that matters. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(100);

/** IANA time zone name, e.g. "Asia/Kolkata". Validated against the runtime's tz database. */
export const timezoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Don't leak password rules on login; just bound the size.
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /** ISO timestamp when the access token expires. */
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}
