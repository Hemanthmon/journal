import { createHash, randomBytes } from 'node:crypto';
import jwt, { JsonWebTokenError } from 'jsonwebtoken';
import { config } from '../../config/env';

export { TokenExpiredError } from 'jsonwebtoken';

const ISSUER = 'journal-api';
const AUDIENCE = 'journal-app';

export function signAccessToken(userId: string): { token: string; expiresAt: Date } {
  const ttl = config.auth.accessTtlSeconds;
  const token = jwt.sign({ typ: 'access' }, config.auth.accessSecret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: ttl,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
}

/** Returns the user id, or throws TokenExpiredError / JsonWebTokenError. */
export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, config.auth.accessSecret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof payload === 'string' || payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new JsonWebTokenError('invalid token payload');
  }
  return payload.sub;
}

/**
 * Refresh tokens are opaque random strings, not JWTs, so they can be revoked. Only their
 * SHA-256 hash is stored; a database leak doesn't expose usable tokens. (A fast hash is
 * fine here because the token has 256 bits of entropy, unlike a password.)
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
