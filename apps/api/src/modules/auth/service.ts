import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  ErrorCode,
  type AuthResponse,
  type AuthTokens,
  type LoginInput,
  type RegisterInput,
} from '@journal/shared';
import { config } from '../../config/env';
import type { Queryable } from '../../db/pool';
import { getPool } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, isMysqlError } from '../../lib/errors';
import * as repo from './repo';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Incorrect email or password');
const invalidRefreshToken = () =>
  new AppError(401, ErrorCode.INVALID_REFRESH_TOKEN, 'Session expired. Please log in again.');

/** Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered. */
let dummyHash: string | undefined;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync('not-a-real-password', config.auth.bcryptRounds);
  return dummyHash;
}

async function issueTokens(db: Queryable, userId: string, familyId: string, now: Date) {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(now.getTime() + config.auth.refreshTtlDays * DAY_MS);
  const refreshId = await repo.insertRefreshToken(db, {
    userId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiresAt,
    now,
  });
  const access = signAccessToken(userId);
  const tokens: AuthTokens = {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
  return { tokens, refreshId };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  // Hash outside the transaction: it's slow and needs no locks.
  const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);
  const now = new Date();
  const userId = randomUUID();

  try {
    return await withTransaction(async (conn) => {
      await repo.insertUser(conn, {
        id: userId,
        email: input.email,
        passwordHash,
        name: input.name,
        timezone: input.timezone ?? 'UTC',
        now,
      });
      await repo.seedDefaultQuestions(conn, userId, now);
      const { tokens } = await issueTokens(conn, userId, randomUUID(), now);
      const user = await repo.findUserById(conn, userId);
      if (!user) throw new Error('user vanished after insert');
      return { user: repo.toPublicUser(user), tokens };
    });
  } catch (err) {
    if (isMysqlError(err, 'ER_DUP_ENTRY')) {
      throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const db = getPool();
  const user = await repo.findUserByEmail(db, input.email);
  const ok = await bcrypt.compare(input.password, user?.password_hash ?? getDummyHash());
  if (!user || !ok) throw invalidCredentials();

  const now = new Date();
  await repo.deleteExpiredRefreshTokens(db, user.id, now);
  const { tokens } = await issueTokens(db, user.id, randomUUID(), now);
  return { user: repo.toPublicUser(user), tokens };
}

/**
 * Rotates a refresh token: the presented token is revoked and a new one issued in the same
 * family.
 *
 * Presenting an already-rotated token is normally a replay, so the whole family is revoked.
 * The exception is a rotated token whose replacement has never been used: that is what a
 * lost response looks like (the phone dropped signal, or the app was closed mid-request,
 * so it never stored the new token). The unused replacement is retired and a fresh token
 * issued instead of logging the user out. Once a replacement has itself been used, two
 * holders exist and the family is still revoked.
 */
export async function refresh(refreshToken: string): Promise<AuthResponse> {
  const now = new Date();
  const outcome = await withTransaction(async (conn) => {
    let row = await repo.findRefreshTokenForUpdate(conn, hashRefreshToken(refreshToken));
    if (!row) return { kind: 'invalid' as const };
    if (row.revoked_at) {
      const next = row.replaced_by ? await repo.findRefreshTokenByIdForUpdate(conn, row.replaced_by) : undefined;
      if (!next || next.revoked_at) {
        await repo.revokeFamily(conn, row.family_id, now);
        return { kind: 'reused' as const };
      }
      // Lost response: continue the session from the unused replacement.
      row = next;
    }
    if (row.expires_at.getTime() <= now.getTime()) return { kind: 'invalid' as const };

    const user = await repo.findUserById(conn, row.user_id);
    if (!user) return { kind: 'invalid' as const };

    const { tokens, refreshId } = await issueTokens(conn, row.user_id, row.family_id, now);
    await repo.markRefreshTokenRotated(conn, row.id, refreshId, now);
    return { kind: 'ok' as const, response: { user: repo.toPublicUser(user), tokens } };
  });

  // Throw after the transaction so the family revocation above is committed.
  if (outcome.kind !== 'ok') throw invalidRefreshToken();
  return outcome.response;
}

/** Ends the session this refresh token belongs to. Unknown tokens are ignored. */
export async function logout(refreshToken: string): Promise<void> {
  const now = new Date();
  await withTransaction(async (conn) => {
    const row = await repo.findRefreshTokenForUpdate(conn, hashRefreshToken(refreshToken));
    if (row) await repo.revokeFamily(conn, row.family_id, now);
  });
}
