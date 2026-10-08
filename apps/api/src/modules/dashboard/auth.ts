import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { ErrorCode, requestCodeSchema, verifyCodeSchema, type ApiErrorBody } from '@journal/shared';
import { config } from '../../config/env';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError } from '../../lib/errors';
import { safeTimeZone } from '../../lib/tz';
import { validateBody } from '../../middleware/validate';
import { findActiveGrant, findGrantById } from './access';
import { getMailer, logMailFailure } from './mailer';

/**
 * Email one-time-code login for the read-only dashboard.
 *
 *  - Only an email with an active grant in `dashboard_access` can receive a code; the
 *    response is identical either way (and returns before any email is sent), so the
 *    endpoint doesn't reveal which address is authorised.
 *  - Codes: 6 random digits, stored as an HMAC, valid 10 minutes, max 5 attempts,
 *    single use; requesting a new code invalidates older ones.
 *  - Session: a signed token in an HttpOnly, SameSite=Strict cookie scoped to
 *    /api/dashboard. Every request re-checks that the grant is still active, and renews
 *    the cookie, so the session only ends after DASHBOARD_SESSION_HOURS without use.
 */

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
export const SESSION_COOKIE = 'jd_session';
const COOKIE_PATH = '/api/dashboard';
const AUDIENCE = 'journal-dashboard';
const ISSUER = 'journal-api';
/** A session older than this is re-issued on the next request (sliding expiry). */
const RENEW_AFTER_SECONDS = 5 * 60;

type Row = RowDataPacket & Record<string, unknown>;

const hashCode = (email: string, code: string) =>
  createHmac('sha256', config.dashboard.sessionSecret).update(`login-code:${email}:${code}`).digest('hex');

const invalidCode = () => new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'That code is incorrect or has expired.');

function limited(_req: Request, res: Response) {
  const body: ApiErrorBody = {
    error: { code: ErrorCode.RATE_LIMITED, message: 'Too many attempts. Please wait a few minutes and try again.' },
  };
  res.status(429).json(body);
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (config.isProduction) attrs.push('Secure');
  return attrs.join('; ');
}

function issueSession(res: Response, grantId: string, viewerEmail: string) {
  const maxAge = config.dashboard.sessionHours * 3600;
  const token = jwt.sign({ typ: 'dashboard', gid: grantId }, config.dashboard.sessionSecret, {
    algorithm: 'HS256',
    subject: viewerEmail,
    audience: AUDIENCE,
    issuer: ISSUER,
    expiresIn: maxAge,
  });
  res.setHeader('Set-Cookie', sessionCookie(token, maxAge));
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export interface DashboardContext {
  grantId: string;
  viewerEmail: string;
  ownerUserId: string;
  ownerName: string;
  timezone: string;
}

/** Requires a valid dashboard session whose grant is still active. */
export async function requireDashboard(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in'));
  let payload: jwt.JwtPayload;
  try {
    const p = jwt.verify(token, config.dashboard.sessionSecret, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
      issuer: ISSUER,
    });
    if (typeof p === 'string' || p.typ !== 'dashboard' || typeof p.gid !== 'string' || typeof p.sub !== 'string') {
      throw new Error('bad payload');
    }
    payload = p;
  } catch {
    return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Your session has ended. Please sign in again.'));
  }
  const grant = await findGrantById(getPool(), payload.gid as string);
  if (!grant || grant.viewerEmail !== payload.sub) {
    return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Access to this dashboard has ended.'));
  }
  const [owners] = await getPool().execute<Row[]>('SELECT name, timezone FROM users WHERE id = ?', [grant.ownerUserId]);
  const owner = owners[0];
  if (!owner) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Access to this dashboard has ended.'));
  req.dashboard = {
    grantId: grant.id,
    viewerEmail: grant.viewerEmail,
    ownerUserId: grant.ownerUserId,
    ownerName: String(owner.name),
    timezone: safeTimeZone(String(owner.timezone)),
  };
  if (typeof payload.iat !== 'number' || Date.now() / 1000 - payload.iat >= RENEW_AFTER_SECONDS) {
    issueSession(res, grant.id, grant.viewerEmail);
  }
  next();
}

export function dashboardAuthRouter(opts: { rateLimitMax: number }): Router {
  const router = Router();
  const ipLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: opts.rateLimitMax * 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: limited,
  });
  router.use(ipLimiter);

  router.post('/request-code', validateBody(requestCodeSchema), async (req, res) => {
    const email = req.body.email as string;
    const grant = config.dashboard.enabled ? await findActiveGrant(getPool(), email) : undefined;
    if (grant) {
      const now = new Date();
      const code = await withTransaction(async (conn) => {
        const [recent] = await conn.execute<Row[]>(
          'SELECT COUNT(*) AS n FROM dashboard_login_codes WHERE email = ? AND created_at > ?',
          [email, new Date(now.getTime() - 60 * 60 * 1000)],
        );
        if (Number(recent[0]?.n ?? 0) >= MAX_CODES_PER_HOUR) return null;
        // A new code replaces any earlier unused one.
        await conn.execute('UPDATE dashboard_login_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL', [
          now,
          email,
        ]);
        const c = String(randomInt(0, 1_000_000)).padStart(6, '0');
        await conn.execute(
          `INSERT INTO dashboard_login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), email, hashCode(email, c), new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000), now],
        );
        return c;
      });
      if (code) {
        const [owners] = await getPool().execute<Row[]>('SELECT name FROM users WHERE id = ?', [grant.ownerUserId]);
        const mail = {
          code,
          minutesValid: CODE_TTL_MINUTES,
          viewerName: grant.viewerName,
          ownerName: String(owners[0]?.name ?? 'Your friend'),
        };
        // Not awaited: the response must not take longer for authorised emails.
        getMailer().sendLoginCode(email, mail).catch(logMailFailure);
      }
    }
    res.json({ data: { message: 'If this email has dashboard access, a sign-in code is on its way.' } });
  });

  router.post('/verify-code', validateBody(verifyCodeSchema), async (req, res) => {
    const { email, code } = req.body as { email: string; code: string };
    const grant = config.dashboard.enabled ? await findActiveGrant(getPool(), email) : undefined;
    if (!grant) throw invalidCode();

    const now = new Date();
    const ok = await withTransaction(async (conn) => {
      const [rows] = await conn.execute<Row[]>(
        `SELECT id, code_hash, expires_at, attempts FROM dashboard_login_codes
          WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [email],
      );
      const row = rows[0];
      if (!row) return false;
      if ((row.expires_at as Date).getTime() <= now.getTime() || Number(row.attempts) >= MAX_ATTEMPTS) {
        await conn.execute('UPDATE dashboard_login_codes SET consumed_at = ? WHERE id = ?', [now, row.id]);
        return false;
      }
      const expected = Buffer.from(String(row.code_hash), 'hex');
      const actual = Buffer.from(hashCode(email, code), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const attempts = Number(row.attempts) + 1;
        await conn.execute('UPDATE dashboard_login_codes SET attempts = ?, consumed_at = ? WHERE id = ?', [
          attempts,
          attempts >= MAX_ATTEMPTS ? now : null,
          row.id,
        ]);
        return false;
      }
      await conn.execute('UPDATE dashboard_login_codes SET consumed_at = ? WHERE id = ?', [now, row.id]);
      return true;
    });
    if (!ok) throw invalidCode();

    issueSession(res, grant.id, grant.viewerEmail);
    res.json({ data: { signedIn: true } });
  });

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    res.status(204).end();
  });

  return router;
}
