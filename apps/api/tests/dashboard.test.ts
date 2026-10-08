import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { habitLogId, dailyRoutineId, journalAnswerId, type PullResponse } from '@journal/shared';
import { config } from '../src/config/env';
import { getPool } from '../src/db/pool';
import { syncEnvAccess } from '../src/modules/dashboard/access';
import { inviteMessage, loginCodeMessage, setMailer, type InviteEmail, type LoginCodeEmail } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/**
 * Read-only web dashboard: email-code login, session protection, analytics, date
 * filtering, Excel export, and compatibility with the mobile sync API.
 * .env.test configures viewer@example.com to view owner@example.com.
 */

const api = makeApi();
const VIEWER = config.dashboard.viewerEmail;
const OWNER = config.dashboard.ownerEmail;
const sent: ({ to: string } & LoginCodeEmail)[] = [];
const invites: ({ to: string } & InviteEmail)[] = [];
setMailer({
  async sendLoginCode(to, mail) {
    sent.push({ to, ...mail });
  },
  async sendInvite(to, mail) {
    invites.push({ to, ...mail });
  },
  async sendUrgeNote() {},
});

let ownerAuth: Record<string, string>;
let ownerId: string;

async function requestCode(email: string) {
  const before = sent.length;
  const res = await api.post('/api/dashboard/auth/request-code').send({ email });
  return { res, code: sent.length > before ? sent.at(-1)!.code : undefined };
}

async function signIn(): Promise<string> {
  const { code } = await requestCode(VIEWER);
  const res = await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code });
  expect(res.status).toBe(200);
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
  return cookie.split(';')[0]!;
}

const iso = (s: string) => new Date(s).toISOString();

// Each test starts with a clean code history (the 5-codes-per-hour cap is tested explicitly).
beforeEach(async () => {
  await getPool().execute('DELETE FROM dashboard_login_codes WHERE email = ?', [VIEWER]);
});
const change = (entity: string, record: Record<string, unknown>) => ({ changeId: randomUUID(), entity, baseSeq: null, record });

beforeAll(async () => {
  const reg = await registerUser(api, { email: OWNER, name: 'Owner', timezone: 'Asia/Kolkata' });
  ownerAuth = bearer(reg.tokens.accessToken);
  ownerId = reg.user.id;
  await syncEnvAccess();

  // Seed a known week (Mon 2026-09-21 .. Sun 2026-09-27) through the normal sync API.
  const pull = (await api.get('/api/sync/pull?cursor=0').set(ownerAuth)).body.data as PullResponse;
  const qByKey = new Map(pull.changes.map((c) => [c.record.systemKey as string, c.record]));
  const created = iso('2026-09-01T00:00:00Z');
  const habitA = { id: randomUUID(), createdAt: created, updatedAt: created, deletedAt: null, name: 'Wake early', description: null, measurementType: 'boolean', targetValue: 1, unit: null, scheduleDays: [1, 2, 3, 4, 5], isActive: true, archivedAt: null, displayOrder: 0 };
  const habitB = { id: randomUUID(), createdAt: created, updatedAt: created, deletedAt: null, name: 'Exercise', description: null, measurementType: 'duration', targetValue: 30, unit: 'minutes', scheduleDays: [1, 2, 3, 4, 5, 6, 7], isActive: true, archivedAt: null, displayOrder: 1 };
  const log = (h: { id: string; targetValue: number; unit: string | null; measurementType: string }, date: string, value: number) => ({
    id: habitLogId(ownerId, h.id, date), createdAt: created, updatedAt: created, deletedAt: null,
    habitId: h.id, localDate: date, value, targetSnapshot: h.targetValue, unitSnapshot: h.unit, typeSnapshot: h.measurementType,
  });
  const routineId = dailyRoutineId(ownerId, '2026-09-23');
  const answer = (key: string, v: { textValue?: string; emojiValue?: number }) => {
    const q = qByKey.get(key)!;
    return {
      id: journalAnswerId(ownerId, '2026-09-23', q.id as string), createdAt: created, updatedAt: iso('2026-09-23T15:00:00Z'), deletedAt: null,
      routineId, questionId: q.id, questionTextSnapshot: q.text, questionTypeSnapshot: q.type,
      textValue: v.textValue ?? null, emojiValue: v.emojiValue ?? null,
    };
  };
  const urge = (date: string, time: string, intensity: number, duration: number | null, trigger: string, emotion: string) => ({
    id: randomUUID(), createdAt: created, updatedAt: created, deletedAt: null, occurredAt: created,
    localDate: date, localTime: time, triggerText: trigger, intensity, durationMinutes: duration,
    actionTaken: 'Went for a walk', outcome: 'It passed', emotionBefore: emotion, masturbated: false, explicitContent: false, remarks: null,
  });
  const res = await api.post('/api/sync/push').set(ownerAuth).send({
    epoch: 1,
    changes: [
      change('habits', habitA),
      change('habits', habitB),
      change('habitLogs', log(habitA, '2026-09-21', 1)),
      change('habitLogs', log(habitA, '2026-09-22', 1)),
      change('habitLogs', log(habitA, '2026-09-24', 0)),
      change('habitLogs', log(habitA, '2026-09-25', 1)),
      change('habitLogs', log(habitB, '2026-09-26', 15)),
      change('habitLogs', log(habitB, '2026-09-27', 30)),
      change('dailyRoutines', { id: routineId, createdAt: created, updatedAt: created, deletedAt: null, localDate: '2026-09-23' }),
      change('journalAnswers', answer('day', { textValue: 'A good day at work.' })),
      change('journalAnswers', answer('mood', { emojiValue: 4 })),
      change('journalAnswers', answer('tomorrow', { textValue: 'Sleep early' })),
      change('journalAnswers', answer('gratitude', { textValue: 'Family' })),
      change('urges', urge('2026-09-22', '10:00', 4, 10, 'Boredom', 'Bored, Lonely')),
      change('urges', urge('2026-09-22', '21:00', 8, null, 'boredom', 'Bored')),
      change('urges', urge('2026-09-26', '18:30', 6, 20, 'Stress at work', 'Stressed')),
      change('urges', urge('2026-09-10', '09:00', 9, 5, 'Phone', 'Tired')),
    ],
  });
  expect(res.body.data.results.every((r: { status: string }) => r.status === 'applied')).toBe(true);

  // Someone else's data must never appear on the dashboard.
  const other = await registerUser(api);
  await api.post('/api/sync/push').set(bearer(other.tokens.accessToken)).send({
    epoch: 1,
    changes: [change('urges', urge('2026-09-22', '11:00', 10, 60, 'SECRET-OTHER-USER', 'Angry'))],
  });
});

describe('dashboard login (email code)', () => {
  it('gives the same response for unauthorised emails and sends them nothing', async () => {
    const auth = await requestCode(VIEWER);
    const unauth = await requestCode('stranger@example.com');
    expect(unauth.res.status).toBe(200);
    expect(unauth.res.body).toEqual(auth.res.body);
    expect(unauth.code).toBeUndefined();
    expect(auth.code).toMatch(/^\d{6}$/);
    const [rows] = await getPool().execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM dashboard_login_codes WHERE email = 'stranger@example.com'",
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('does not let an email without an account or access sign in', async () => {
    for (const email of ['random@example.com']) {
      const { code } = await requestCode(email);
      expect(code).toBeUndefined();
      const res = await api.post('/api/dashboard/auth/verify-code').send({ email, code: '123456' });
      expect(res.status).toBe(401);
    }
  });

  it('signs in with the correct code and sets a secure session cookie', async () => {
    const { code } = await requestCode(VIEWER);
    const res = await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^jd_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/dashboard');
    expect(JSON.stringify(res.body)).not.toContain(code!);
  });

  it('rejects wrong, reused and expired codes', async () => {
    const { code } = await requestCode(VIEWER);
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: wrong })).status).toBe(401);
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code })).status).toBe(200);
    // Single use.
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code })).status).toBe(401);

    const second = await requestCode(VIEWER);
    await getPool().execute('UPDATE dashboard_login_codes SET expires_at = ? WHERE email = ? AND consumed_at IS NULL', [
      new Date(Date.now() - 1000),
      VIEWER,
    ]);
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: second.code })).status).toBe(401);
  });

  it('locks a code after 5 wrong attempts, and a new code replaces the old one', async () => {
    const { code } = await requestCode(VIEWER);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: wrong });
    }
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code })).status).toBe(401);

    const a = await requestCode(VIEWER);
    const b = await requestCode(VIEWER);
    if (a.code !== b.code) {
      expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: a.code })).status).toBe(401);
    }
    expect((await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: b.code })).status).toBe(200);
  });

  it('sends at most 5 codes per hour to one address', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await requestCode(VIEWER)).code);
    expect(codes.slice(0, 5).every((c) => /^\d{6}$/.test(c ?? ''))).toBe(true);
    expect(codes[5]).toBeUndefined();
  });

  it('validates the code format', async () => {
    const res = await api.post('/api/dashboard/auth/verify-code').send({ email: VIEWER, code: '12ab' });
    expect(res.status).toBe(400);
  });
});

describe('dashboard API protection', () => {
  const routes = ['/me', '/overview', '/habits', '/days', '/days/2026-09-23', '/urges', '/export.xlsx'];

  it('rejects requests without a session', async () => {
    for (const r of routes) expect((await api.get(`/api/dashboard${r}`)).status).toBe(401);
  });

  it('rejects the mobile app token, forged and expired sessions', async () => {
    const forged = jwt.sign({ typ: 'dashboard', gid: randomUUID() }, 'wrong-secret-wrong-secret-wrong-secret!!', {
      subject: VIEWER, audience: 'journal-dashboard', issuer: 'journal-api',
    });
    const expired = jwt.sign({ typ: 'dashboard', gid: randomUUID(), exp: Math.floor(Date.now() / 1000) - 10 }, config.dashboard.sessionSecret, {
      subject: VIEWER, audience: 'journal-dashboard', issuer: 'journal-api',
    });
    expect((await api.get('/api/dashboard/overview').set(ownerAuth)).status).toBe(401);
    expect((await api.get('/api/dashboard/overview').set('Cookie', `jd_session=${forged}`)).status).toBe(401);
    expect((await api.get('/api/dashboard/overview').set('Cookie', `jd_session=${expired}`)).status).toBe(401);
  });

  it('renews an active session so it only ends after a period without use', async () => {
    const fresh = await signIn();
    const soon = await api.get('/api/dashboard/me').set('Cookie', fresh);
    expect(soon.status).toBe(200);
    expect(soon.headers['set-cookie']).toBeUndefined();

    const [grants] = await getPool().execute<RowDataPacket[]>(
      'SELECT id FROM dashboard_access WHERE viewer_email = ? AND revoked_at IS NULL',
      [VIEWER],
    );
    const old = jwt.sign(
      { typ: 'dashboard', gid: grants[0]!.id, iat: Math.floor(Date.now() / 1000) - 3600 },
      config.dashboard.sessionSecret,
      { subject: VIEWER, audience: 'journal-dashboard', issuer: 'journal-api', expiresIn: '2h' },
    );
    const res = await api.get('/api/dashboard/me').set('Cookie', `jd_session=${old}`);
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^jd_session=/);
    expect(cookie).toContain(`Max-Age=${config.dashboard.sessionHours * 3600}`);
    expect(cookie).not.toContain(old);
  });

  it('is read-only: no write routes exist', async () => {
    const cookie = await signIn();
    for (const [method, url] of [
      ['post', '/api/dashboard/habits'],
      ['patch', '/api/dashboard/days/2026-09-23'],
      ['delete', '/api/dashboard/urges'],
      ['put', '/api/dashboard/overview'],
    ] as const) {
      expect((await api[method](url).set('Cookie', cookie).send({})).status).toBe(404);
    }
  });

  it('ends existing sessions immediately when access is revoked, and restores on re-sync', async () => {
    const cookie = await signIn();
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).status).toBe(200);
    await getPool().execute('UPDATE dashboard_access SET revoked_at = ? WHERE viewer_email = ?', [new Date(), VIEWER]);
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).status).toBe(401);
    expect((await requestCode(VIEWER)).code).toBeUndefined();
    await syncEnvAccess();
    const fresh = await signIn();
    expect((await api.get('/api/dashboard/me').set('Cookie', fresh)).status).toBe(200);
  });

  it('logs out by clearing the cookie', async () => {
    const res = await api.post('/api/dashboard/auth/logout');
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
  });
});

describe('sharing the dashboard from the app', () => {
  const friend = uniqueEmail();
  const access = '/api/dashboard-access';

  it('requires the app login', async () => {
    expect((await api.get(access)).status).toBe(401);
    expect((await api.post(access).send({ name: 'Priya', email: friend })).status).toBe(401);
  });

  it('validates the name and email', async () => {
    expect((await api.post(access).set(ownerAuth).send({ name: ' ', email: friend })).status).toBe(400);
    expect((await api.post(access).set(ownerAuth).send({ name: 'Priya', email: 'nope' })).status).toBe(400);
  });

  it('shares with a named person, invites them once, and lets them sign in by email code', async () => {
    const res = await api.post(access).set(ownerAuth).send({ name: 'Priya Sharma', email: friend.toUpperCase() });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: friend, name: 'Priya Sharma', managedByServer: false });
    expect(invites.at(-1)).toMatchObject({ to: friend, viewerName: 'Priya Sharma', ownerName: 'Owner' });
    expect(invites.at(-1)!.dashboardUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    // Sharing again only renames; no second invitation.
    const before = invites.length;
    const again = await api.post(access).set(ownerAuth).send({ name: 'Priya', email: friend });
    expect(again.status).toBe(200);
    expect(again.body.data.name).toBe('Priya');
    expect(invites.length).toBe(before);

    const list = (await api.get(access).set(ownerAuth)).body.data as { email: string; managedByServer: boolean }[];
    expect(list.map((v) => [v.email, v.managedByServer])).toEqual(expect.arrayContaining([[VIEWER, true], [friend, false]]));

    const { code } = await requestCode(friend);
    expect(sent.at(-1)).toMatchObject({ to: friend, viewerName: 'Priya', ownerName: 'Owner' });
    const login = await api.post('/api/dashboard/auth/verify-code').send({ email: friend, code });
    expect(login.status).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).body.data.ownerName).toBe('Owner');
  });

  it("keeps each owner's list private and only the owner can remove someone", async () => {
    const other = await registerUser(api, { email: uniqueEmail(), name: 'Other', timezone: 'UTC' });
    const otherAuth = bearer(other.tokens.accessToken);
    expect((await api.get(access).set(otherAuth)).body.data).toEqual([]);
    const list = (await api.get(access).set(ownerAuth)).body.data as { id: string; email: string }[];
    const grant = list.find((v) => v.email === friend)!;
    expect((await api.delete(`${access}/${grant.id}`).set(otherAuth)).status).toBe(404);
    const envGrant = list.find((v) => v.email === VIEWER)!;
    expect((await api.delete(`${access}/${envGrant.id}`).set(ownerAuth)).status).toBe(409);
  });

  it('ends access immediately when the owner removes someone', async () => {
    const { code } = await requestCode(friend);
    const login = await api.post('/api/dashboard/auth/verify-code').send({ email: friend, code });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const grant = ((await api.get(access).set(ownerAuth)).body.data as { id: string; email: string }[]).find((v) => v.email === friend)!;
    expect((await api.delete(`${access}/${grant.id}`).set(ownerAuth)).status).toBe(204);
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).status).toBe(401);
    expect((await requestCode(friend)).code).toBeUndefined();
    expect(((await api.get(access).set(ownerAuth)).body.data as { email: string }[]).some((v) => v.email === friend)).toBe(false);
  });
});

describe('dashboard emails', () => {
  it('escapes names and shows the code', () => {
    const msg = loginCodeMessage({ code: '482916', minutesValid: 10, viewerName: '<b>Eve</b>', ownerName: 'Sam <script>' });
    expect(msg.html).not.toMatch(/<b>Eve|<script>/);
    expect(msg.html).toContain('&lt;b&gt;Eve');
    expect(msg.text).toContain('482916');
    const invite = inviteMessage({ viewerName: 'Ana', ownerName: 'Sam Lee', dashboardUrl: 'https://x.test/?a="b"' }, 'ana@example.com');
    expect(invite.subject).toBe('Sam shared their journal with you 🌿');
    expect(invite.html).toContain('href="https://x.test/?a=&quot;b&quot;"');
  });
});

describe('dashboard data', () => {
  let cookie: string;
  const get = async (url: string) => {
    const res = await api.get(url).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    return res.body.data;
  };
  const WEEK = 'from=2026-09-21&to=2026-09-27';

  beforeAll(async () => {
    cookie = await signIn();
  });

  it("describes the owner and uses the owner's time zone", async () => {
    const me = await get('/api/dashboard/me');
    expect(me).toMatchObject({ viewerEmail: VIEWER, ownerName: 'Owner', timezone: 'Asia/Kolkata', firstDate: '2026-09-01' });
  });

  it('computes the overview for a date range', async () => {
    const o = await get(`/api/dashboard/overview?${WEEK}`);
    expect(o.range).toEqual({ from: '2026-09-21', to: '2026-09-27', days: 7 });
    // Wake early: Mon-Fri scheduled, done Mon/Tue/Fri. Exercise: daily, done Sun (and 50% Sat).
    expect(o.habits).toMatchObject({ scheduledHabitDays: 12, completedHabitDays: 4 });
    expect(o.journal).toEqual({ daysWritten: 1, days: 7 });
    expect(o.mood).toMatchObject({ latest: 4, latestDate: '2026-09-23' });
    expect(o.urges).toEqual({ total: 3, avgIntensity: 6, avgDuration: 15, totalDuration: 30, withDuration: 2, diverted: 3, notDiverted: 0, unanswered: 0, divertedPercent: 100 });
    expect(o.series).toHaveLength(7);
    expect(o.recent.length).toBeGreaterThan(0);
    expect(JSON.stringify(o)).not.toContain('SECRET-OTHER-USER');
  });

  it('filters by date range, including "all records"', async () => {
    const one = await get('/api/dashboard/urges?from=2026-09-22&to=2026-09-22');
    expect(one.stats.total).toBe(2);
    const all = await get('/api/dashboard/urges');
    expect(all.stats.total).toBe(4);
    expect(all.range.from).toBe('2026-09-01');
    const bad = await api.get('/api/dashboard/urges?from=2026-09-30&to=2026-09-01').set('Cookie', cookie);
    expect(bad.status).toBe(400);
  });

  it('computes habit analytics and history', async () => {
    const { habits } = await get(`/api/dashboard/habits?${WEEK}`);
    const wake = habits.find((h: { name: string }) => h.name === 'Wake early');
    const ex = habits.find((h: { name: string }) => h.name === 'Exercise');
    expect(wake).toMatchObject({ scheduledDays: 5, completedDays: 3, incompleteDays: 2, completionPercent: 60, status: 'active' });
    expect(ex).toMatchObject({ scheduledDays: 7, completedDays: 1, incompleteDays: 6, completionPercent: 14.3, unit: 'minutes', target: 30 });
    expect(wake.weekly).toEqual([{ weekStart: '2026-09-21', completed: 3, scheduled: 5, percent: 60 }]);

    const { habit } = await get(`/api/dashboard/habits/${wake.id}?${WEEK}`);
    expect(habit.calendar.map((c: { scheduled: boolean }) => c.scheduled)).toEqual([true, true, true, true, true, false, false]);
    expect(habit.calendar[0]).toMatchObject({ date: '2026-09-21', progress: 100 });
    expect((await api.get(`/api/dashboard/habits/${randomUUID()}`).set('Cookie', cookie)).status).toBe(404);
  });

  it('shows a complete day, preserving the original questions', async () => {
    const day = await get('/api/dashboard/days/2026-09-23');
    expect(day).toMatchObject({
      weekday: 'Wednesday',
      mood: 4,
      improveTomorrow: 'Sleep early',
      grateful: 'Family',
    });
    expect(day.answers.map((a: { question: string }) => a.question)).toEqual([
      'How was your day? Tell us about it.',
      'How are you feeling today?',
      "What's one thing you could do better tomorrow?",
      'What are you grateful for today?',
    ]);
    expect(day.habits.map((h: { name: string }) => h.name)).toEqual(['Wake early', 'Exercise']);

    const days = await get(`/api/dashboard/days?${WEEK}`);
    expect(days.days[0].date).toBe('2026-09-27');
    expect(days.days.find((d: { date: string }) => d.date === '2026-09-22')).toMatchObject({ urges: 2 });
  });

  it('computes urge analytics with neutral, aggregated data', async () => {
    const u = await get(`/api/dashboard/urges?${WEEK}`);
    expect(u.stats).toEqual({ total: 3, avgIntensity: 6, avgDuration: 15, totalDuration: 30, withDuration: 2, diverted: 3, notDiverted: 0, unanswered: 0, divertedPercent: 100 });
    expect(u.triggers[0]).toEqual({ label: 'Boredom', count: 2 });
    expect(u.emotions).toEqual([
      { label: 'Bored', count: 2 },
      { label: 'Lonely', count: 1 },
      { label: 'Stressed', count: 1 },
    ]);
    expect(u.daily.find((d: { date: string }) => d.date === '2026-09-22')).toMatchObject({ count: 2, avgIntensity: 6, totalDuration: 10 });
    expect(u.records[0]).toMatchObject({ localDate: '2026-09-26', localTime: '18:30', durationMinutes: 20, weekday: 'Saturday' });
    expect(JSON.stringify(u)).not.toContain('SECRET-OTHER-USER');
  });

  it('exports a real .xlsx with three sheets matching the date range', async () => {
    const res = await api
      .get(`/api/dashboard/export.xlsx?${WEEK}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('journal-2026-09-21-to-2026-09-27.xlsx');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Daily Habits', 'Journal and Mood', 'Urge Records']);
    const rows = (name: string) => wb.getWorksheet(name)!.rowCount - 1;
    expect(rows('Daily Habits')).toBe(12);
    expect(rows('Journal and Mood')).toBe(4);
    expect(rows('Urge Records')).toBe(3);
    const urgeSheet = wb.getWorksheet('Urge Records')!;
    expect(urgeSheet.getRow(1).values).toContain('Duration (min)');
    expect(urgeSheet.getRow(2).getCell(3).value).toBe('10:00 AM');
    const all: string[] = [];
    urgeSheet.eachRow((r) => all.push(JSON.stringify(r.values)));
    expect(all.join()).not.toContain('2026-09-10');
    expect(all.join()).not.toContain('SECRET-OTHER-USER');
  });
});

describe('mobile API compatibility (urge duration)', () => {
  it('accepts urges from app versions without the duration field, and keeps durations on unrelated edits', async () => {
    const now = new Date().toISOString();
    const legacy = {
      id: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, occurredAt: now,
      localDate: '2026-09-28', localTime: '08:00', triggerText: null, intensity: 3,
      actionTaken: null, outcome: null, emotionBefore: null, masturbated: null, explicitContent: null, remarks: null,
    };
    const res = await api.post('/api/sync/push').set(ownerAuth).send({ epoch: 1, changes: [change('urges', legacy)] });
    expect(res.body.data.results[0].status).toBe('applied');

    const created = await api.post('/api/urges').set(ownerAuth).send({ localDate: '2026-09-28', localTime: '09:00', intensity: 5, durationMinutes: 12 });
    expect(created.body.data.durationMinutes).toBe(12);
    const patched = await api.patch(`/api/urges/${created.body.data.id}`).set(ownerAuth).send({ intensity: 6 });
    expect(patched.body.data).toMatchObject({ intensity: 6, durationMinutes: 12 });
    const bad = await api.post('/api/urges').set(ownerAuth).send({ localDate: '2026-09-28', localTime: '09:00', intensity: 5, durationMinutes: 5000 });
    expect(bad.status).toBe(400);
  });
});
