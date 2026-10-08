import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { planReviewId, type DashboardPlanner, type PullResponse } from '@journal/shared';
import { getPool } from '../src/db/pool';
import { buildPlanner } from '../src/modules/dashboard/planner';
import { setMailer } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/**
 * Planner records sync like every other record, and the web dashboard shows them to the
 * people the owner shared it with.
 */

const api = makeApi();
const codes: { to: string; code: string }[] = [];
setMailer({
  async sendLoginCode(to, mail) {
    codes.push({ to, code: mail.code });
  },
  async sendInvite() {},
});

const t0 = '2026-10-01T08:00:00.000Z';
const base = (id: string = randomUUID()) => ({ id, createdAt: t0, updatedAt: t0, deletedAt: null });
const change = (entity: string, record: Record<string, unknown>) => ({ changeId: randomUUID(), entity, baseSeq: null, record });

let auth: Record<string, string>;
let userId: string;
const reader = base();
const athlete = base();
const focus = base();
const weekly = base();

async function push(changes: ReturnType<typeof change>[], who = auth) {
  const res = await api.post('/api/sync/push').set(who).send({ epoch: 1, changes });
  expect(res.status).toBe(200);
  return res.body.data.results as { status: string; errorCode?: string }[];
}

const task = (date: string, title: string, extra: Record<string, unknown> = {}) => ({
  ...base(),
  title,
  localDate: date,
  identityId: null,
  goalId: null,
  localTime: null,
  place: null,
  twoMinute: null,
  completedAt: null,
  displayOrder: 0,
  ...extra,
});

beforeAll(async () => {
  const reg = await registerUser(api, { email: uniqueEmail(), name: 'Asha', timezone: 'Asia/Kolkata' });
  auth = bearer(reg.tokens.accessToken);
  userId = reg.user.id;
});

describe('planner sync', () => {
  it('syncs identities, goals, tasks and reviews both ways', async () => {
    const results = await push([
      change('identities', { ...reader, statement: 'I am a reader', isActive: true, displayOrder: 0 }),
      change('identities', { ...athlete, statement: 'I am an athlete', isActive: true, displayOrder: 1 }),
      change('planGoals', { ...focus, level: 'month', periodStart: '2026-10-01', text: 'Finish two books', identityId: reader.id, parentId: null, doneAt: null, displayOrder: 0 }),
      change('planGoals', { ...weekly, level: 'week', periodStart: '2026-10-05', text: 'Read 100 pages', identityId: reader.id, parentId: focus.id, doneAt: null, displayOrder: 0 }),
      change('planTasks', task('2026-10-05', 'Read 20 pages', { identityId: reader.id, goalId: weekly.id, localTime: '07:00', place: 'Bedroom chair', twoMinute: 'Open the book', completedAt: t0 })),
      change('planTasks', task('2026-10-06', 'Read 20 pages', { identityId: reader.id, goalId: weekly.id, localTime: '07:00' })),
      change('planTasks', task('2026-10-06', 'Run 2 km', { identityId: athlete.id, completedAt: t0 })),
      change('planTasks', task('2026-10-07', 'Stretch')),
      change('planReviews', { ...base(planReviewId(userId, 'week', '2026-09-28')), level: 'week', periodStart: '2026-09-28', wentWell: 'Read daily', makeEasier: null, onePercent: 'Phone away' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(9).fill('applied'));

    const pull = (await api.get('/api/sync/pull?cursor=0').set(auth)).body.data as PullResponse;
    const entities = pull.changes.map((c) => c.entity);
    for (const e of ['identities', 'planGoals', 'planTasks', 'planReviews']) expect(entities).toContain(e);
    const synced = pull.changes.find((c) => c.entity === 'planTasks' && c.record.place === 'Bedroom chair')!.record;
    expect(synced).toMatchObject({ localTime: '07:00:00', twoMinute: 'Open the book', completedAt: t0 });
  });

  it('rejects goals and reviews whose period does not start on a Monday / the 1st', async () => {
    const results = await push([
      change('planGoals', { ...base(), level: 'week', periodStart: '2026-10-08', text: 'x', identityId: null, parentId: null, doneAt: null, displayOrder: 0 }),
      change('planReviews', { ...base(), level: 'month', periodStart: '2026-10-05', wentWell: null, makeEasier: null, onePercent: null }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  });

  it("is deleted with the user's data", async () => {
    const other = await registerUser(api, { email: uniqueEmail(), password: 'password123' });
    const otherAuth = bearer(other.tokens.accessToken);
    await push([change('planTasks', task('2026-10-06', 'Temp'))], otherAuth);
    expect((await api.delete('/api/account/data').set(otherAuth).send({ password: 'password123' })).status).toBe(200);
    const [rows] = await getPool().query('SELECT COUNT(*) AS n FROM plan_tasks WHERE user_id = ?', [other.user.id]);
    expect((rows as { n: number }[])[0]!.n).toBe(0);
  });
});

describe('planner on the web dashboard', () => {
  it('shows the week, its month, identity votes and reviews to a viewer the owner shared with', async () => {
    const viewer = uniqueEmail();
    expect((await api.post('/api/dashboard-access').set(auth).send({ name: 'Ravi', email: viewer })).status).toBe(201);
    await api.post('/api/dashboard/auth/request-code').send({ email: viewer });
    const code = codes.find((c) => c.to === viewer)!.code;
    const login = await api.post('/api/dashboard/auth/verify-code').send({ email: viewer, code });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    const res = await api.get('/api/dashboard/planner?date=2026-10-08').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const p = res.body.data as DashboardPlanner;
    expect(p.week).toMatchObject({ start: '2026-10-05', end: '2026-10-11', tasks: 4, tasksDone: 2 });
    expect(p.week.goals).toEqual([
      { text: 'Read 100 pages', done: false, identity: 'I am a reader', focus: 'Finish two books', weeklyGoals: [], tasks: 2, tasksDone: 1 },
    ]);
    expect(p.month.focuses[0]).toMatchObject({ text: 'Finish two books', weeklyGoals: [{ text: 'Read 100 pages', done: false }], tasks: 2, tasksDone: 1 });
    expect(p.days.map((d) => d.tasks.length)).toEqual([1, 2, 1, 0, 0, 0, 0]);
    expect(p.days[0]!.tasks[0]).toEqual({
      title: 'Read 20 pages', done: true, time: '07:00', place: 'Bedroom chair', twoMinute: 'Open the book', identity: 'I am a reader',
    });
    expect(p.identities.map((i) => [i.statement, i.weekVotes, i.totalVotes])).toEqual([
      ['I am a reader', 1, 1],
      ['I am an athlete', 1, 1],
    ]);
    expect(p.reviews).toEqual([{ level: 'week', periodStart: '2026-09-28', wentWell: 'Read daily', makeEasier: null, onePercent: 'Phone away' }]);

    // Without a session: nothing.
    expect((await api.get('/api/dashboard/planner')).status).toBe(401);
  });
});

describe('buildPlanner', () => {
  it("flags yesterday's unfinished tasks only for the current week, unless carried over", () => {
    const mk = (localDate: string, title: string, done = false) =>
      ({ ...task(localDate, title), completedAt: done ? t0 : null, localTime: null }) as never;
    const data = { identities: [], goals: [], reviews: [], tasks: [mk('2026-10-07', 'Read'), mk('2026-10-07', 'Run'), mk('2026-10-07', 'Done', true), mk('2026-10-08', 'run')] };
    expect(buildPlanner(data, '2026-10-08', '2026-10-08').missedYesterday).toEqual(['Read']);
    expect(buildPlanner(data, '2026-10-08', '2026-09-30').missedYesterday).toEqual([]);
  });
});
