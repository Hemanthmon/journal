import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireHttps } from '../src/middleware/security';

function app(trustProxy: boolean) {
  const a = express();
  if (trustProxy) a.set('trust proxy', 1);
  a.use(requireHttps(true));
  a.get('/api/health', (_req, res) => res.json({ ok: true }));
  a.get('/api/profile', (_req, res) => res.json({ ok: true }));
  return request(a);
}

describe('HTTPS enforcement (production)', () => {
  it('rejects plain HTTP API requests', async () => {
    const res = await app(true).get('/api/profile');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HTTPS_REQUIRED');
  });

  it('accepts requests the proxy received over HTTPS', async () => {
    const res = await app(true).get('/api/profile').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });

  it('ignores X-Forwarded-Proto unless the proxy is trusted', async () => {
    const res = await app(false).get('/api/profile').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(403);
  });

  it('lets the platform health check through over HTTP', async () => {
    expect((await app(true).get('/api/health')).status).toBe(200);
  });
});
