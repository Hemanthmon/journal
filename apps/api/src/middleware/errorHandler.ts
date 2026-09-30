import type { NextFunction, Request, Response } from 'express';
import { ErrorCode, type ApiErrorBody } from '@journal/shared';
import { AppError } from '../lib/errors';
import { describeError, logger } from '../lib/logger';

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorBody = { error: { code: ErrorCode.NOT_FOUND, message: 'Route not found' } };
  res.status(404).json(body);
}

/** body-parser errors are plain Errors with a `type` and `status`. */
function bodyParserError(err: unknown): AppError | undefined {
  const type = (err as { type?: unknown })?.type;
  if (type === 'entity.parse.failed') return new AppError(400, ErrorCode.VALIDATION_ERROR, 'Malformed JSON body');
  if (type === 'entity.too.large') return new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body too large');
  return undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const known = err instanceof AppError ? err : bodyParserError(err);
  if (known) {
    const body: ApiErrorBody = {
      error: { code: known.code, message: known.message, ...(known.details ? { details: known.details } : {}) },
    };
    res.status(known.status).json(body);
    return;
  }

  // Unexpected: log without the message (it can contain user data) and return a generic error.
  logger.error('unhandled_error', { method: req.method, path: req.path, ...describeError(err) });
  const body: ApiErrorBody = { error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' } };
  res.status(500).json(body);
}
