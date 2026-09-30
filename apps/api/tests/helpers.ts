import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthResponse } from '@journal/shared';
import { createApp, type AppOptions } from '../src/app';

export function makeApi(opts?: AppOptions) {
  return request(createApp(opts));
}

export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

export async function registerUser(
  api: ReturnType<typeof makeApi>,
  overrides: Partial<{ name: string; email: string; password: string; timezone: string }> = {},
): Promise<AuthResponse & { password: string }> {
  const password = overrides.password ?? 'correct horse battery';
  const res = await api
    .post('/api/auth/register')
    .send({ name: 'Test User', email: uniqueEmail(), timezone: 'Asia/Kolkata', ...overrides, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...(res.body.data as AuthResponse), password };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
