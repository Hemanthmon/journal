import { z } from 'zod';

export const idSchema = z.uuid({ message: 'Must be a UUID' });

/** A calendar date in the user's local time zone, e.g. "2026-09-29". */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Not a real calendar date');

/** Local wall-clock time, "HH:MM" or "HH:MM:SS"; normalised to "HH:MM:SS". */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be a time in HH:MM format')
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

/** UTC instant as produced by Date.prototype.toISOString(). */
export const isoDateTimeSchema = z.iso.datetime({ message: 'Must be an ISO-8601 UTC timestamp' });

/** Non-negative number with at most two decimal places (fits DECIMAL(10,2)). */
export const decimal2 = z
  .number()
  .finite()
  .min(0)
  .max(99_999_999.99)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'At most two decimal places');

export const displayOrderSchema = z.number().int().min(0).max(1_000_000);

/** Optional free text: trimmed, empty string becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v.trim() === '' ? null : v));

/** Reorder request: ids in their new order. */
export const reorderSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(500),
  })
  .strict()
  .refine((v) => new Set(v.ids).size === v.ids.length, { message: 'ids must be unique', path: ['ids'] });
export type ReorderInput = z.infer<typeof reorderSchema>;

/** Fields every synced record carries on the wire. */
export const baseRecordShape = {
  id: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
};

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A record as returned by the server, with its sync sequence number. */
export type WithSeq<T> = T & { serverSeq: number };

/** Date-range filter used by list endpoints. */
export const dateRangeQuerySchema = z
  .object({
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '`from` must not be after `to`', path: ['from'] });
