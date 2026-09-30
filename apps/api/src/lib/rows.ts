import type { NextFunction, Request, Response } from 'express';
import { idSchema } from '@journal/shared';
import { notFound } from './errors';

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * Rejects non-UUID `:id` params with 404 — the same response as "exists but isn't yours",
 * so ids can't be probed.
 */
export function requireIdParam(req: Request, _res: Response, next: NextFunction): void {
  if (!idSchema.safeParse(req.params.id).success) {
    next(notFound());
    return;
  }
  next();
}

/** `?, ?, ?` for an IN (...) list. */
export const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');
