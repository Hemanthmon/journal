import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config/env';
import { getPool } from '../src/db/pool';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

const api = makeApi();

describe('POST /api/auth/register', () => {
  it('creates a user, returns tokens, and never returns the password hash', async () => {
    const email = uniqueEmail();
    const res = await api
      .post('/api/auth/register')
      .send({ name: '  Asha  ', email: email.toUpperCase(), password: 'longenough1', timezone: 'Asia/Kolkata' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: 'Asha', email, timezone: 'Asia/Kolkata' });
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('stores a bcrypt hash, not the plaintext password', async () => {
    const { user, password } = await registerUser(api);
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    const hash = rows[0]?.password_hash as string;
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toContain(password);
  });

  it('creates the four default questions for the new user', async () => {
    const { user } = await registerUser(api);
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT text, type, system_key, server_seq FROM journal_questions WHERE user_id = ? ORDER BY display_order',
      [user.id],
    );
    expect(rows.map((r) => r.system_key)).toEqual(['day', 'mood', 'tomorrow', 'gratitude']);
    // Each row gets its own sync sequence number, and the user's counter matches.
    expect(rows.map((r) => r.server_seq)).toEqual([1, 2, 3, 4]);
    const [u] = await getPool().execute<RowDataPacket[]>('SELECT sync_seq FROM users WHERE id = ?', [user.id]);
    expect(u[0]?.sync_seq).toBe(4);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail();
    await registerUser(api, { email });
    const res = await api.post('/api/auth/register').send({ name: 'X', email, password: 'longenough1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    [{ name: 'X', email: 'not-an-email', password: 'longenough1' }, 'email'],
    [{ name: 'X', email: 'a@b.co', password: 'short' }, 'password'],
    [{ name: '', email: 'a@b.co', password: 'longenough1' }, 'name'],
    [{ name: 'X', email: 'a@b.co', password: 'longenough1', timezone: 'Mars/Olympus' }, 'timezone'],
  ])('validates input (%j)', async (body, field) => {
    const res = await api.post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    // Validation errors must not echo submitted values back.
    expect(JSON.stringify(res.body)).not.toContain('longenough1');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials (email is case-insensitive)', async () => {
    const { user, password } = await registerUser(api);
    const res = await api.post('/api/auth/login').send({ email: user.email.toUpperCase(), password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const { user } = await registerUser(api);
    const wrongPassword = await api.post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    const unknownEmail = await api.post('/api/auth/login').send({ email: uniqueEmail(), password: 'wrong-password' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('protected routes', () => {
  it('rejects requests without a token', async () => {
    const res = await api.get('/api/profile');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed or tampered token', async () => {
    const { tokens } = await registerUser(api);
    const tampered = tokens.accessToken.slice(0, -2) + (tokens.accessToken.endsWith('AA') ? 'BB' : 'AA');
    expect((await api.get('/api/profile').set(bearer('garbage'))).status).toBe(401);
    expect((await api.get('/api/profile').set(bearer(tampered))).status).toBe(401);
  });

  it('rejects a token signed with another secret or algorithm', async () => {
    const { user } = await registerUser(api);
    const forged = jwt.sign({ typ: 'access' }, 'some-other-secret-that-is-long-enough!!', {
      subject: user.id,
      issuer: 'journal-api',
      audience: 'journal-app',
    });
    const none = jwt.sign({ typ: 'access', sub: user.id }, '', { algorithm: 'none' });
    expect((await api.get('/api/profile').set(bearer(forged))).status).toBe(401);
    expect((await api.get('/api/profile').set(bearer(none))).status).toBe(401);
  });

  it('reports an expired token as TOKEN_EXPIRED so the client knows to refresh', async () => {
    const { user } = await registerUser(api);
    const expired = jwt.sign(
      { typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      config.auth.accessSecret,
      { subject: user.id, issuer: 'journal-api', audience: 'journal-app' },
    );
    const res = await api.get('/api/profile').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and returns a working access token', async () => {
    const { tokens } = await registerUser(api);
    const res = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.refreshToken).not.toBe(tokens.refreshToken);
    const profile = await api.get('/api/profile').set(bearer(res.body.data.tokens.accessToken));
    expect(profile.status).toBe(200);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await api.post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(43) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('recovers when the client never received the rotated token (lost response)', async () => {
    const { tokens } = await registerUser(api);
    const lost = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    const lostToken = lost.body.data.tokens.refreshToken as string;

    // The client still holds the old token; its replacement was never used.
    const retry = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(retry.status).toBe(200);
    const profile = await api.get('/api/profile').set(bearer(retry.body.data.tokens.accessToken));
    expect(profile.status).toBe(200);

    // Once the session moves on from the new token, the one nobody received is a replay.
    await api.post('/api/auth/refresh').send({ refreshToken: retry.body.data.tokens.refreshToken });
    expect((await api.post('/api/auth/refresh').send({ refreshToken: lostToken })).status).toBe(401);
  });

  it('keeps working after a recovered lost response', async () => {
    const { tokens } = await registerUser(api);
    await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    const retry = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    const next = await api.post('/api/auth/refresh').send({ refreshToken: retry.body.data.tokens.refreshToken });
    expect(next.status).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole session family', async () => {
    const { tokens } = await registerUser(api);
    const first = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    // The replacement is used, so a second holder of the old token is a replay.
    const second = await api.post('/api/auth/refresh').send({ refreshToken: first.body.data.tokens.refreshToken });
    const newest = second.body.data.tokens.refreshToken as string;

    // Replaying the old (already rotated) token...
    const replay = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(replay.status).toBe(401);

    // ...also kills the legitimate newest token from the same login.
    const afterReplay = await api.post('/api/auth/refresh').send({ refreshToken: newest });
    expect(afterReplay.status).toBe(401);
  });

  it('does not affect sessions from a separate login', async () => {
    const { user, password, tokens } = await registerUser(api);
    const other = await api.post('/api/auth/login').send({ email: user.email, password });
    const first = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    await api.post('/api/auth/refresh').send({ refreshToken: first.body.data.tokens.refreshToken });
    await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken }); // reuse -> revoke family 1
    const res = await api.post('/api/auth/refresh').send({ refreshToken: other.body.data.tokens.refreshToken });
    expect(res.status).toBe(200);
  });

  it('rejects an expired refresh token', async () => {
    const { tokens, user } = await registerUser(api);
    await getPool().execute('UPDATE refresh_tokens SET expires_at = ? WHERE user_id = ?', [
      new Date(Date.now() - 1000),
      user.id,
    ]);
    const res = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(401);
  });

  it('stores only a hash of refresh tokens', async () => {
    const { tokens, user } = await registerUser(api);
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT token_hash FROM refresh_tokens WHERE user_id = ?', [
      user.id,
    ]);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).not.toBe(tokens.refreshToken);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token', async () => {
    const { tokens } = await registerUser(api);
    const out = await api.post('/api/auth/logout').send({ refreshToken: tokens.refreshToken });
    expect(out.status).toBe(204);
    const res = await api.post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(401);
  });

  it('succeeds silently for unknown tokens', async () => {
    const res = await api.post('/api/auth/logout').send({ refreshToken: 'y'.repeat(43) });
    expect(res.status).toBe(204);
  });
});

describe('rate limiting', () => {
  it('limits repeated failed logins for one email', async () => {
    const limited = makeApi({ authRateLimitMax: 3 });
    const email = uniqueEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await limited.post('/api/auth/login').send({ email, password: 'wrong-password' })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});
