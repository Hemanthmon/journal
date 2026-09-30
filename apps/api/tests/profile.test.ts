import { describe, expect, it } from 'vitest';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

describe('profile', () => {
  it("returns only the caller's own profile", async () => {
    const a = await registerUser(api, { name: 'Alice' });
    const b = await registerUser(api, { name: 'Bob' });
    const resA = await api.get('/api/profile').set(bearer(a.tokens.accessToken));
    const resB = await api.get('/api/profile').set(bearer(b.tokens.accessToken));
    expect(resA.body.data).toMatchObject({ id: a.user.id, name: 'Alice' });
    expect(resB.body.data).toMatchObject({ id: b.user.id, name: 'Bob' });
  });

  it('updates name and timezone', async () => {
    const { tokens } = await registerUser(api);
    const res = await api
      .patch('/api/profile')
      .set(bearer(tokens.accessToken))
      .send({ name: 'Renamed', timezone: 'Europe/London' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Renamed', timezone: 'Europe/London' });
  });

  it('does not allow changing fields outside the schema (e.g. email or id)', async () => {
    const { tokens } = await registerUser(api);
    const res = await api
      .patch('/api/profile')
      .set(bearer(tokens.accessToken))
      .send({ email: 'hijack@example.com', id: 'other' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty update', async () => {
    const { tokens } = await registerUser(api);
    const res = await api.patch('/api/profile').set(bearer(tokens.accessToken)).send({});
    expect(res.status).toBe(400);
  });
});

describe('API conventions', () => {
  it('returns a consistent 404 body for unknown routes', async () => {
    const res = await api.get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not grant CORS to unlisted browser origins', async () => {
    const res = await api.get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
