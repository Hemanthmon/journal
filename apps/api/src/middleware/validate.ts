import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { ErrorCode } from '@journal/shared';
import { AppError } from '../lib/errors';

/** Converts Zod issues to API details. Only paths and rule messages — never the submitted values. */
export function zodDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

/**
 * Validates and replaces `req.body` with the parsed value (trimmed, lower-cased, defaults applied).
 * Unknown keys are stripped unless the schema is strict.
 */
export function validateBody<S extends z.ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request', zodDetails(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Parses `req.query` (read-only in Express 5) and stores the result on `res.locals.query`.
 */
export function validateQuery<S extends z.ZodType>(schema: S) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', zodDetails(result.error)));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
