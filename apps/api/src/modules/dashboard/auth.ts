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
import { findActiveGrant, findGrantById, type AccessGrant } from './access';
import { getMailer, logMailFailure } from './mailer';
import { trackVisit } from './visits';

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

/** A viewer session names its grant (`gid`); the owner's own session names the user (`own`). */
type SessionClaims = { gid: string } | { own: string };

function issueSession(res: Response, claims: SessionClaims, email: string) {
  const maxAge = config.dashboard.sessionHours * 3600;
  const token = jwt.sign({ typ: 'dashboard', ...claims }, config.dashboard.sessionSecret, {
    algorithm: 'HS256',
    subject: email,
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
  /** null for the owner's own session. */
  grantId: string | null;
  viewerEmail: string;
  /** As the owner named them when sharing (null for the owner, or if not given). */
  viewerName: string | null;
  ownerUserId: string;
  ownerName: string;
  timezone: string;
  /** The owner signed in to their own dashboard: may add and edit calendar blocks. */
  isOwner: boolean;
}

/**
 * Who an email signs in as: a viewer with an active grant, or else the owner of an app
 * account with that email (their own dashboard). A grant wins, so a friend who also uses
 * the app still sees the journal that was shared with them.
 */
type Principal =
  | { kind: 'viewer'; grant: AccessGrant }
  | { kind: 'owner'; userId: string; name: string };

async function findPrincipal(email: string): Promise<Principal | undefined> {
  if (!config.dashboard.enabled) return undefined;
  const [grant, [users]] = await Promise.all([
    findActiveGrant(getPool(), email),
    getPool().execute<Row[]>('SELECT id, name FROM users WHERE email = ?', [email]),
  ]);
  const u = users[0];
  const owner = u ? { kind: 'owner' as const, userId: String(u.id), name: String(u.name) } : undefined;
  // Sharing with your own email doesn't make you a viewer of yourself.
  if (grant && grant.ownerUserId !== owner?.userId) return { kind: 'viewer', grant };
  return owner;
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
    const valid =
      typeof p !== 'string' &&
      p.typ === 'dashboard' &&
      typeof p.sub === 'string' &&
      (typeof p.gid === 'string' || typeof p.own === 'string');
    if (!valid) throw new Error('bad payload');
    payload = p as jwt.JwtPayload;
  } catch {
    return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Your session has ended. Please sign in again.'));
  }
  const ended = () => next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Access to this dashboard has ended.'));
  let claims: SessionClaims;
  let ownerUserId: string;
  let grantId: string | null = null;
  let viewerName: string | null = null;
  if (typeof payload.gid === 'string') {
    const grant = await findGrantById(getPool(), payload.gid);
    if (!grant || grant.viewerEmail !== payload.sub) return ended();
    claims = { gid: grant.id };
    ownerUserId = grant.ownerUserId;
    grantId = grant.id;
    viewerName = grant.viewerName;
    void trackVisit(grant, req.get('user-agent'));
  } else {
    claims = { own: String(payload.own) };
    ownerUserId = String(payload.own);
  }
  const [owners] = await getPool().execute<Row[]>('SELECT email, name, timezone FROM users WHERE id = ?', [ownerUserId]);
  const owner = owners[0];
  if (!owner) return ended();
  // The owner's session ends if the account's email changes.
  if (!grantId && owner.email !== payload.sub) return ended();
  req.dashboard = {
    grantId,
    viewerEmail: String(payload.sub),
    viewerName,
    ownerUserId,
    ownerName: String(owner.name),
    timezone: safeTimeZone(String(owner.timezone)),
    isOwner: !grantId,
  };
  if (typeof payload.iat !== 'number' || Date.now() / 1000 - payload.iat >= RENEW_AFTER_SECONDS) {
    issueSession(res, claims, String(payload.sub));
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
    const who = await findPrincipal(email);
    if (who) {
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
        let mail;
        if (who.kind === 'viewer') {
          const [owners] = await getPool().execute<Row[]>('SELECT name FROM users WHERE id = ?', [who.grant.ownerUserId]);
          mail = { code, minutesValid: CODE_TTL_MINUTES, viewerName: who.grant.viewerName, ownerName: String(owners[0]?.name ?? 'Your friend') };
        } else {
          mail = { code, minutesValid: CODE_TTL_MINUTES, viewerName: who.name, ownerName: who.name };
        }
        // Not awaited: the response must not take longer for authorised emails.
        getMailer().sendLoginCode(email, mail).catch(logMailFailure);
      }
    }
    res.json({ data: { message: 'If this email has dashboard access, a sign-in code is on its way.' } });
  });

  router.post('/verify-code', validateBody(verifyCodeSchema), async (req, res) => {
    const { email, code } = req.body as { email: string; code: string };
    const who = await findPrincipal(email);
    if (!who) throw invalidCode();

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

    if (who.kind === 'viewer') {
      issueSession(res, { gid: who.grant.id }, who.grant.viewerEmail);
      await trackVisit(who.grant, req.get('user-agent'), { signedIn: true });
    }
    else issueSession(res, { own: who.userId }, email);
    res.json({ data: { signedIn: true } });
  });

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    res.status(204).end();
  });

  return router;
}
