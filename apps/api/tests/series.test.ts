import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { seriesInstanceId, type DashboardCalendar, type PullResponse } from '@journal/shared';
import { setMailer } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** Repeating blocks and tasks: created on the web, seen by the app, edited per day or onwards. */

const api = makeApi();
const codes = new Map<string, string>();
setMailer({
  async sendLoginCode(to, mail) {
    codes.set(to, mail.code);
  },
  async sendInvite() {},
  async sendUrgeNote() {},
});

let userId: string;
let auth: Record<string, string>;
let cookie: string;

const cal = async (from: string, to: string) =>
  (await api.get(`/api/dashboard/calendar?from=${from}&to=${to}`).set('Cookie', cookie)).body.data as DashboardCalendar;
const block = { title: 'Gym', startTime: '07:00', endTime: '08:00', color: 'sage', identityId: null };

beforeAll(async () => {
  const email = uniqueEmail();
  const reg = await registerUser(api, { email });
  userId = reg.user.id;
  auth = bearer(reg.tokens.accessToken);
  await api.post('/api/dashboard/auth/request-code').send({ email });
  const res = await api.post('/api/dashboard/auth/verify-code').send({ email, code: codes.get(email) });
  cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
});

describe('repeating blocks and tasks', () => {
  let seriesId: string;

  it('creates a weekday block series on the web; the calendar and the app both see each day', async () => {
    const res = await api
      .post('/api/dashboard/owner/series')
      .set('Cookie', cookie)
      .send({ kind: 'block', startDate: '2026-10-05', fields: block, repeat: { frequency: 'custom', days: [1, 2, 3, 4, 5], endDate: null } });
    expect(res.status).toBe(201);
    seriesId = res.body.data.id;

    const week = await cal('2026-10-05', '2026-10-11');
    expect(week.blocks.map((b) => b.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(week.blocks[0]).toMatchObject({ id: seriesInstanceId(userId, seriesId, '2026-10-05'), seriesId });
    expect(week.series).toEqual([{ id: seriesId, frequency: 'custom', days: [1, 2, 3, 4, 5], endDate: null }]);

    const pull = (await api.get('/api/sync/pull?cursor=0').set(auth)).body.data as PullResponse;
    expect(pull.changes.some((c) => c.entity === 'repeatSeries' && c.record.id === seriesId)).toBe(true);
    expect(pull.changes.filter((c) => c.entity === 'timeBlocks').length).toBeGreaterThanOrEqual(5);
  });

  it('agrees with an occurrence the app made first (same id, no duplicate)', async () => {
    const id = seriesInstanceId(userId, seriesId, '2026-10-12');
    const t = new Date().toISOString();
    await api.post('/api/sync/push').set(auth).send({
      epoch: 1,
      changes: [{ changeId: randomUUID(), entity: 'timeBlocks', baseSeq: null, record: { id, createdAt: t, updatedAt: t, deletedAt: null, seriesId, localDate: '2026-10-12', ...block, notes: null } }],
    });
    const next = await cal('2026-10-12', '2026-10-18');
    expect(next.blocks.filter((b) => b.date === '2026-10-12')).toHaveLength(1);
  });

  it('deletes one day only, and it stays deleted', async () => {
    const res = await api
      .post('/api/dashboard/owner/occurrence/delete')
      .set('Cookie', cookie)
      .send({ kind: 'block', id: seriesInstanceId(userId, seriesId, '2026-10-07'), scope: 'one' });
    expect(res.status).toBe(200);
    expect((await cal('2026-10-05', '2026-10-11')).blocks.map((b) => b.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09']);
  });

  it('edits this and following: earlier days keep the old block, later days get the new one', async () => {
    const res = await api
      .post('/api/dashboard/owner/occurrence/edit')
      .set('Cookie', cookie)
      .send({
        kind: 'block',
        id: seriesInstanceId(userId, seriesId, '2026-10-08'),
        scope: 'following',
        date: '2026-10-08',
        fields: { ...block, title: 'Swim', startTime: '18:00', endTime: '19:00' },
        repeat: { frequency: 'weekly', days: [4], endDate: null },
      });
    expect(res.status).toBe(200);
    const two = await cal('2026-10-05', '2026-10-18');
    expect(two.blocks.map((b) => `${b.date} ${b.title}`)).toEqual(['2026-10-05 Gym', '2026-10-06 Gym', '2026-10-08 Swim', '2026-10-15 Swim']);
  });

  it('repeating tasks get one task per day, each ticked separately', async () => {
    await api
      .post('/api/dashboard/owner/series')
      .set('Cookie', cookie)
      .send({ kind: 'task', startDate: '2026-11-02', fields: { title: 'Read', startTime: '21:00', endTime: null, color: null, identityId: null }, repeat: { frequency: 'daily', days: [1], endDate: '2026-11-04' } });
    const nov = await cal('2026-11-01', '2026-11-07');
    expect(nov.tasks.map((t) => t.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(nov.tasks.every((t) => !!t.seriesId && t.time === '21:00')).toBe(true);
  });

  it('rejects a block series without times', async () => {
    const res = await api
      .post('/api/dashboard/owner/series')
      .set('Cookie', cookie)
      .send({ kind: 'block', startDate: '2026-10-05', fields: { ...block, startTime: null }, repeat: { frequency: 'daily', days: [1], endDate: null } });
    expect(res.status).toBe(400);
  });
});
