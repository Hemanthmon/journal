import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PullResponse } from '@journal/shared';
import { getPool } from '../src/db/pool';
import { GoogleApiError, decryptToken, encryptToken, setGoogleApi, type EventBody, type GoogleApi, type GoogleEvent } from '../src/modules/google/client';
import { syncGoogle } from '../src/modules/google/sync';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** Two-way Google Calendar sync against an in-memory fake Google. */

class FakeGoogle implements GoogleApi {
  events = new Map<string, GoogleEvent>();
  // Real time, like Google's `updated` stamps (pulls ask for changes since the last pull).
  clock = Date.now();
  calls: string[] = [];
  private stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  async exchangeCode() {
    return { refreshToken: 'refresh-123', email: 'me@gmail.com' };
  }
  async accessToken() {
    return 'access';
  }
  async listEvents(_t: string, _c: string, p: { updatedMin?: string }) {
    const items = [...this.events.values()].filter((e) => !p.updatedMin || (e.updated ?? '') >= p.updatedMin);
    return { items };
  }
  async insertEvent(_t: string, _c: string, body: EventBody) {
    this.calls.push('insert');
    const ev: GoogleEvent = { ...body, id: `ev-${randomUUID()}`, status: 'confirmed', updated: this.stamp() };
    this.events.set(ev.id, ev);
    return ev;
  }
  async patchEvent(_t: string, _c: string, id: string, body: EventBody) {
    this.calls.push('patch');
    const cur = this.events.get(id);
    if (!cur || cur.status === 'cancelled') throw new GoogleApiError(404, 'notFound');
    const ev = { ...cur, ...body, updated: this.stamp() };
    this.events.set(id, ev);
    return ev;
  }
  async deleteEvent(_t: string, _c: string, id: string) {
    this.calls.push('delete');
    const cur = this.events.get(id);
    if (cur) this.events.set(id, { ...cur, status: 'cancelled', updated: this.stamp() });
  }
  /** Someone edits in Google Calendar. */
  edit(id: string, patch: Partial<GoogleEvent>) {
    this.events.set(id, { ...this.events.get(id)!, ...patch, updated: this.stamp() });
  }
  add(ev: Omit<GoogleEvent, 'id' | 'updated' | 'status'>) {
    const e: GoogleEvent = { ...ev, id: `g-${randomUUID()}`, status: 'confirmed', updated: this.stamp() };
    this.events.set(e.id, e);
    return e;
  }
}

const api = makeApi();
let google: FakeGoogle;
let auth: Record<string, string>;
let userId: string;
const t = () => new Date().toISOString();

const block = (extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), createdAt: t(), updatedAt: t(), deletedAt: null,
  title: 'Deep work', localDate: '2026-10-08', startTime: '09:00', endTime: '11:00', color: 'sage', identityId: null, notes: null,
  ...extra,
});

async function push(record: Record<string, unknown>) {
  const res = await api.post('/api/sync/push').set(auth).send({
    epoch: 1,
    changes: [{ changeId: randomUUID(), entity: 'timeBlocks', baseSeq: null, record }],
  });
  expect(res.body.data.results[0].status).toBe('applied');
}

async function blocks() {
  const pull = (await api.get('/api/sync/pull?cursor=0').set(auth)).body.data as PullResponse;
  return pull.changes.filter((c) => c.entity === 'timeBlocks').map((c) => c.record as Record<string, unknown>);
}

beforeAll(async () => {
  const reg = await registerUser(api, { email: uniqueEmail(), timezone: 'Asia/Kolkata' });
  auth = bearer(reg.tokens.accessToken);
  userId = reg.user.id;
});

beforeEach(async () => {
  google = new FakeGoogle();
  setGoogleApi(google);
});

describe('google calendar', () => {
  it('encrypts the refresh token at rest', () => {
    const blob = encryptToken('secret-refresh');
    expect(blob.toString('utf8')).not.toContain('secret-refresh');
    expect(decryptToken(blob)).toBe('secret-refresh');
  });

  it('connects through the signed link and Google callback', async () => {
    expect((await api.get('/api/google/status').set(auth)).body.data).toMatchObject({ available: true, connected: false });
    const link = (await api.post('/api/google/connect-link').set(auth)).body.data.url as string;
    const state = new URL(link).searchParams.get('state')!;

    const start = await api.get(`/api/google/start?state=${encodeURIComponent(state)}`);
    expect(start.status).toBe(302);
    expect(start.headers.location).toContain('accounts.google.com');
    expect(start.headers.location).toContain('access_type=offline');

    expect((await api.get('/api/google/callback?state=forged&code=x')).status).toBe(400);
    const cb = await api.get(`/api/google/callback?state=${encodeURIComponent(state)}&code=abc`);
    expect(cb.status).toBe(200);
    expect(cb.text).toContain('Google Calendar connected');
    const status = (await api.get('/api/google/status').set(auth)).body.data;
    expect(status).toMatchObject({ connected: true, googleEmail: 'me@gmail.com' });
    const [rows] = await getPool().query('SELECT refresh_token FROM google_accounts WHERE user_id = ?', [userId]);
    expect(decryptToken((rows as { refresh_token: Buffer }[])[0]!.refresh_token)).toBe('refresh-123');
  });

  it('sends app blocks to Google, then edits and deletes', async () => {
    const b = block();
    await push(b);
    await syncGoogle(userId, { force: true });
    const ev = [...google.events.values()].find((e) => e.extendedProperties?.private?.journalBlockId === b.id)!;
    expect(ev).toMatchObject({
      summary: 'Deep work',
      colorId: '2',
      start: { dateTime: '2026-10-08T09:00:00', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-10-08T11:00:00', timeZone: 'Asia/Kolkata' },
    });

    // Nothing changed: nothing is sent again.
    google.calls = [];
    await syncGoogle(userId, { force: true });
    expect(google.calls).toEqual([]);

    await push({ ...b, updatedAt: new Date(Date.now() + 5).toISOString(), title: 'Writing', endTime: '12:00' });
    await syncGoogle(userId, { force: true });
    expect(google.events.get(ev.id)).toMatchObject({ summary: 'Writing', end: { dateTime: '2026-10-08T12:00:00' } });
    expect(google.calls).toEqual(['patch']);

    await push({ ...b, updatedAt: new Date(Date.now() + 10).toISOString(), deletedAt: t() });
    await syncGoogle(userId, { force: true });
    expect(google.events.get(ev.id)!.status).toBe('cancelled');
  });

  it('brings Google events into the app, follows edits and deletions, and ignores all-day events', async () => {
    const ev = google.add({
      summary: 'Dentist',
      colorId: '11',
      start: { dateTime: '2026-10-09T10:30:00+05:30' },
      end: { dateTime: '2026-10-09T11:15:00+05:30' },
    });
    google.add({ summary: 'Holiday', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } });
    await syncGoogle(userId, { force: true });
    let mine = (await blocks()).filter((b) => b.title === 'Dentist' || b.title === 'Holiday');
    expect(mine).toEqual([expect.objectContaining({ title: 'Dentist', localDate: '2026-10-09', startTime: '10:30:00', endTime: '11:15:00', color: 'rose', deletedAt: null })]);

    // Our own import isn't sent back to Google.
    google.calls = [];
    await syncGoogle(userId, { force: true });
    expect(google.calls).toEqual([]);

    // A UTC time is shown in the owner's zone (Asia/Kolkata, +5:30).
    google.edit(ev.id, { summary: 'Dentist (moved)', start: { dateTime: '2026-10-09T06:00:00Z' }, end: { dateTime: '2026-10-09T07:00:00Z' } });
    await syncGoogle(userId, { force: true });
    mine = (await blocks()).filter((b) => String(b.title).startsWith('Dentist'));
    expect(mine.at(-1)).toMatchObject({ title: 'Dentist (moved)', startTime: '11:30:00', endTime: '12:30:00' });

    google.edit(ev.id, { status: 'cancelled' });
    await syncGoogle(userId, { force: true });
    expect((await blocks()).find((b) => String(b.title).startsWith('Dentist'))!.deletedAt).not.toBeNull();
  });

  it('recreates an event that was deleted in Google while the block changed in the app', async () => {
    const b = block({ title: 'Gym' });
    await push(b);
    await syncGoogle(userId, { pull: false });
    const ev = [...google.events.values()].find((e) => e.extendedProperties?.private?.journalBlockId === b.id)!;
    google.events.delete(ev.id);
    await push({ ...b, updatedAt: new Date(Date.now() + 5).toISOString(), endTime: '10:30' });
    await syncGoogle(userId, { pull: false });
    const again = [...google.events.values()].filter((e) => e.extendedProperties?.private?.journalBlockId === b.id);
    expect(again).toHaveLength(1);
    expect(again[0]!.end?.dateTime).toBe('2026-10-08T10:30:00');
  });

  it('records an error instead of failing when Google rejects the token', async () => {
    const revoked = Object.create(google) as GoogleApi;
    revoked.accessToken = async () => {
      throw new GoogleApiError(400, 'invalid_grant');
    };
    setGoogleApi(revoked);
    await syncGoogle(userId, { force: true });
    expect((await api.get('/api/google/status').set(auth)).body.data.lastError).toMatch(/revoked/);
  });

  it('disconnects, keeping blocks and Google events', async () => {
    expect((await api.delete('/api/google').set(auth)).status).toBe(204);
    expect((await api.get('/api/google/status').set(auth)).body.data.connected).toBe(false);
    expect((await blocks()).length).toBeGreaterThan(0);
  });
});
