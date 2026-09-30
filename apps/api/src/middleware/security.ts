import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErrorCode, type ApiErrorBody } from '@journal/shared';
import { logger } from '../lib/logger';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * In production the API must only be reached over HTTPS. TLS is expected to terminate at a
 * reverse proxy; set TRUST_PROXY=1 so `req.secure` reflects X-Forwarded-Proto.
 * The health check is exempt: hosting platforms probe it over plain HTTP from inside
 * their network, and it returns no data.
 */
export function requireHttps(enabled: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled || req.secure || req.path === '/api/health') {
      next();
      return;
    }
    const body: ApiErrorBody = { error: { code: ErrorCode.HTTPS_REQUIRED, message: 'HTTPS is required' } };
    res.status(403).json(body);
  };
}

function rateLimitedResponse(_req: Request, res: Response) {
  const body: ApiErrorBody = {
    error: { code: ErrorCode.RATE_LIMITED, message: 'Too many attempts. Please wait a few minutes and try again.' },
  };
  res.status(429).json(body);
}

/** Limits all auth endpoints per client IP. */
export function authIpLimiter(max: number) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: max * 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitedResponse,
  });
}

/**
 * Limits login attempts per target email, regardless of IP, to slow credential stuffing
 * against one account. Only failed attempts count.
 */
export function loginEmailLimiter(max: number) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase()}`,
    handler: rateLimitedResponse,
  });
}

/** Logs method, path (no query string), status and duration. Never bodies or headers. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
    });
  });
  next();
}
