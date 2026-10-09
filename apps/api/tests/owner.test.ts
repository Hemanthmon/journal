import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { dailyRoutineId, habitLogId, journalAnswerId, type PullResponse } from '@journal/shared';
import { setMailer } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** The owner edits everything from the website; edits reach the app; viewers can't write. */

const api = makeApi();
const codes = new Map<string, string>();
setMailer({
  async sendLoginCode(to, mail) {
    codes.set(to, mail.code);
  },
  async sendInvite() {},
  async sendUrgeNote() {},
});

async function signIn(email: string) {
  codes.delete(email);
  await api.post('/api/dashboard/auth/request-code').send({ email });
  const res = await api.post('/api/dashboard/auth/verify-code').send({ email, code: codes.get(email) });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

let userId: string;
let auth: Record<string, string>;
let owner: string;
let viewer: string;

const put = (entity: string, record: Record<string, unknown>, baseSeq?: number | null, cookie = owner) =>
  api.put(`/api/dashboard/owner/records/${entity}`).set('Cookie', cookie).send({ record, baseSeq });

async function data(from = '2026-10-05', to = '2026-10-11') {
  const res = await api.get(`/api/dashboard/owner/data?from=${from}&to=${to}`).set('Cookie', owner);
  expect(res.status).toBe(200);
  return res.body.data as { userId: string; records: Record<string, Record<string, unknown>[]> };
}

async function pulled(entity: string) {
  const pull = (await api.get('/api/sync/pull?cursor=0').set(auth)).body.data as PullResponse;
  return pull.changes.filter((c) => c.entity === entity).map((c) => c.record as Record<string, unknown>);
}

beforeAll(async () => {
  const email = uniqueEmail();
  const reg = await registerUser(api, { email, name: 'Asha' });
  userId = reg.user.id;
  auth = bearer(reg.tokens.accessToken);
  const v = uniqueEmail();
  await api.post('/api/dashboard-access').set(auth).send({ name: 'Ravi', email: v });
  owner = await signIn(email);
  viewer = await signIn(v);
});

describe('owner editing on the website', () => {
  it('loads definitions and the dated records in range', async () => {
    const d = await data();
    expect(d.userId).toBe(userId);
    expect(d.records.journalQuestions!.length).toBe(4); // the defaults
    expect(d.records.habitLogs).toEqual([]);
  });

  it('creates a habit and logs it; the app receives both', async () => {
    const habit = {
      id: randomUUID(), name: 'Read', description: null, measurementType: 'duration', targetValue: 20, unit: 'minutes',
      scheduleDays: [1, 2, 3, 4, 5, 6, 7], isActive: true, archivedAt: null, displayOrder: 0,
    };
    expect((await put('habits', habit)).status).toBe(200);
    const log = {
      id: habitLogId(userId, habit.id, '2026-10-08'), habitId: habit.id, localDate: '2026-10-08', value: 25,
      targetSnapshot: 20, unitSnapshot: 'minutes', typeSnapshot: 'duration',
    };
    const saved = await put('habitLogs', log);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ value: 25, deletedAt: null });
    expect((await pulled('habitLogs')).map((l) => l.value)).toContain(25);
    expect((await data()).records.habitLogs!.length).toBe(1);
  });

  it("writes the day's journal and detects an edit made on the phone meanwhile", async () => {
    const d = await data();
    const q = d.records.journalQuestions!.find((x) => x.systemKey === 'day')!;
    const routine = { id: dailyRoutineId(userId, '2026-10-08'), localDate: '2026-10-08' };
    expect((await put('dailyRoutines', routine)).status).toBe(200);
    const answer = {
      id: journalAnswerId(userId, '2026-10-08', q.id as string), routineId: routine.id, questionId: q.id,
      questionTextSnapshot: q.text, questionTypeSnapshot: 'text', textValue: 'Written on the web', emojiValue: null,
    };
    const first = await put('journalAnswers', answer, null);
    expect(first.status).toBe(200);
    const seq = first.body.data.serverSeq as number;

    // The phone edits the same answer.
    const t = new Date(Date.now() + 1000).toISOString();
    await api.post('/api/sync/push').set(auth).send({
      epoch: 1,
      changes: [{ changeId: randomUUID(), entity: 'journalAnswers', baseSeq: seq, record: { ...answer, createdAt: t, updatedAt: t, deletedAt: null, textValue: 'From the phone' } }],
    });

    // The web, still on the old version, is told instead of overwriting.
    const stale = await put('journalAnswers', { ...answer, textValue: 'Web again' }, seq);
    expect(stale.status).toBe(409);
    expect(stale.body.record.textValue).toBe('From the phone');
  });

  it('records, edits and deletes an urge', async () => {
    const urge = {
      id: randomUUID(), occurredAt: '2026-10-08T15:00:00.000Z', localDate: '2026-10-08', localTime: '20:30', triggerText: 'Bored',
      intensity: 6, durationMinutes: 10, actionTaken: 'Walked', outcome: 'Passed', emotionBefore: 'Bored', masturbated: false,
      explicitContent: false, remarks: null,
    };
    expect((await put('urges', urge)).status).toBe(200);
    expect((await put('urges', { ...urge, intensity: 3 })).body.data.intensity).toBe(3);
    expect((await put('urges', { ...urge, deletedAt: 'yes' })).body.data.deletedAt).not.toBeNull();
    expect((await data()).records.urges).toEqual([]);
  });

  it('adds and ticks a planner task', async () => {
    const task = {
      id: randomUUID(), title: 'Call mum', localDate: '2026-10-08', identityId: null, goalId: null, localTime: '18:00',
      place: null, twoMinute: null, completedAt: null, displayOrder: 0,
    };
    expect((await put('planTasks', task)).status).toBe(200);
    const done = await put('planTasks', { ...task, completedAt: new Date().toISOString() });
    expect(done.body.data.completedAt).not.toBeNull();
  });

  it('rejects invalid records and record types it does not edit', async () => {
    expect((await put('urges', { id: randomUUID(), localDate: 'nope', localTime: '20:00', intensity: 99 })).status).toBe(400);
    expect((await put('journalQuestions', { id: randomUUID() })).status).toBe(404);
  });

  it('is owner-only', async () => {
    expect((await api.get('/api/dashboard/owner/data?from=2026-10-05&to=2026-10-11').set('Cookie', viewer)).status).toBe(403);
    expect((await put('planTasks', { id: randomUUID() }, undefined, viewer)).status).toBe(403);
  });
});
