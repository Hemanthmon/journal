import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '@journal/shared';
import { AppError, unauthenticated } from '../lib/errors';
import { verifyAccessToken, TokenExpiredError } from '../modules/auth/tokens';

/** Requires a valid `Authorization: Bearer <access token>` header and sets `req.userId`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const match = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match?.[1]) {
    next(unauthenticated());
    return;
  }
  try {
    req.userId = verifyAccessToken(match[1]);
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      next(new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Access token expired'));
    } else {
      next(unauthenticated('Invalid access token'));
    }
  }
}

/** Returns the authenticated user's id. Use only on routes behind `authenticate`. */
export function requireUserId(req: Request): string {
  if (!req.userId) throw unauthenticated();
  return req.userId;
}
