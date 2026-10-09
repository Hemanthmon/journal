import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DashboardCalendar, DashboardMe, PullResponse } from '@journal/shared';
import { getPool } from '../src/db/pool';
import { setMailer } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** The owner signs in to their own dashboard and edits calendar blocks; viewers only read. */

const api = makeApi();
const codes = new Map<string, string>();
setMailer({
  async sendLoginCode(to, mail) {
    codes.set(to, mail.code);
  },
  async sendInvite() {},
  async sendUrgeNote() {},
});

async function signIn(email: string): Promise<string> {
  codes.delete(email);
  await api.post('/api/dashboard/auth/request-code').send({ email });
  const code = codes.get(email);
  expect(code).toBeDefined();
  const res = await api.post('/api/dashboard/auth/verify-code').send({ email, code });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

let ownerEmail: string;
let ownerAuth: Record<string, string>;
let ownerCookie: string;
let viewerCookie: string;
const block = { title: 'Deep work', localDate: '2026-10-08', startTime: '09:00', endTime: '11:00', color: 'sage' };

beforeAll(async () => {
  ownerEmail = uniqueEmail();
  const reg = await registerUser(api, { email: ownerEmail, name: 'Asha Rao' });
  ownerAuth = bearer(reg.tokens.accessToken);
  const viewer = uniqueEmail();
  await api.post('/api/dashboard-access').set(ownerAuth).send({ name: 'Ravi', email: viewer });
  ownerCookie = await signIn(ownerEmail);
  viewerCookie = await signIn(viewer);
});

describe('owner on the website', () => {
  it('signs in with their app email and is marked as owner; viewers are not', async () => {
    const me = (await api.get('/api/dashboard/me').set('Cookie', ownerCookie)).body.data as DashboardMe;
    expect(me).toMatchObject({ isOwner: true, ownerName: 'Asha Rao', viewerEmail: ownerEmail });
    const vme = (await api.get('/api/dashboard/me').set('Cookie', viewerCookie)).body.data as DashboardMe;
    expect(vme).toMatchObject({ isOwner: false, ownerName: 'Asha Rao' });
  });

  it('adds, edits and deletes blocks, and the app receives them on sync', async () => {
    const created = await api.post('/api/dashboard/blocks').set('Cookie', ownerCookie).send(block);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const cal = (await api.get('/api/dashboard/calendar?from=2026-10-05&to=2026-10-11').set('Cookie', ownerCookie)).body.data as DashboardCalendar;
    expect(cal.canEdit).toBe(true);
    expect(cal.blocks).toEqual([
      expect.objectContaining({ id, title: 'Deep work', date: '2026-10-08', start: '09:00', end: '11:00', color: 'sage' }),
    ]);

    const edited = await api.put(`/api/dashboard/blocks/${id}`).set('Cookie', ownerCookie).send({ ...block, endTime: '12:00', color: 'sky' });
    expect(edited.status).toBe(200);

    const pull = (await api.get('/api/sync/pull?cursor=0').set(ownerAuth)).body.data as PullResponse;
    const synced = pull.changes.find((c) => c.entity === 'timeBlocks' && c.record.id === id)!.record;
    expect(synced).toMatchObject({ endTime: '12:00:00', color: 'sky', deletedAt: null });

    expect((await api.delete(`/api/dashboard/blocks/${id}`).set('Cookie', ownerCookie)).status).toBe(204);
    const after = (await api.get('/api/dashboard/calendar?from=2026-10-05&to=2026-10-11').set('Cookie', ownerCookie)).body.data as DashboardCalendar;
    expect(after.blocks).toEqual([]);
  });

  it('rejects blocks that end before they start', async () => {
    const res = await api.post('/api/dashboard/blocks').set('Cookie', ownerCookie).send({ ...block, endTime: '08:00' });
    expect(res.status).toBe(400);
  });

  it('shows blocks made in the app, and timed tasks, to viewers, who cannot change them', async () => {
    const t = new Date().toISOString();
    const appBlock = { id: randomUUID(), createdAt: t, updatedAt: t, deletedAt: null, ...block, title: 'Gym', identityId: null, notes: null };
    const task = {
      id: randomUUID(), createdAt: t, updatedAt: t, deletedAt: null, title: 'Call mum', localDate: '2026-10-09', identityId: null,
      goalId: null, localTime: '18:30', place: null, twoMinute: null, completedAt: null, displayOrder: 0,
    };
    const push = await api.post('/api/sync/push').set(ownerAuth).send({
      epoch: 1,
      changes: [
        { changeId: randomUUID(), entity: 'timeBlocks', baseSeq: null, record: appBlock },
        { changeId: randomUUID(), entity: 'planTasks', baseSeq: null, record: task },
      ],
    });
    expect(push.body.data.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);

    const cal = (await api.get('/api/dashboard/calendar?from=2026-10-05&to=2026-10-11').set('Cookie', viewerCookie)).body.data as DashboardCalendar;
    expect(cal.canEdit).toBe(false);
    expect(cal.blocks.map((b) => b.title)).toEqual(['Gym']);
    expect(cal.tasks).toEqual([expect.objectContaining({ title: 'Call mum', date: '2026-10-09', time: '18:30', done: false })]);

    expect((await api.post('/api/dashboard/blocks').set('Cookie', viewerCookie).send(block)).status).toBe(403);
    expect((await api.put(`/api/dashboard/blocks/${appBlock.id}`).set('Cookie', viewerCookie).send(block)).status).toBe(403);
    expect((await api.delete(`/api/dashboard/blocks/${appBlock.id}`).set('Cookie', viewerCookie)).status).toBe(403);
  });

  it("can't share with their own email, and an old self-share still signs them in as owner", async () => {
    const self = await api.post('/api/dashboard-access').set(ownerAuth).send({ name: 'Me', email: ownerEmail });
    expect(self.status).toBe(400);
    const [u] = await getPool().query('SELECT id FROM users WHERE email = ?', [ownerEmail]);
    const id = (u as { id: string }[])[0]!.id;
    await getPool().execute(
      "INSERT INTO dashboard_access (id, owner_user_id, viewer_email, viewer_name, source, granted_at) VALUES (?, ?, ?, 'Me', 'manual', ?)",
      [randomUUID(), id, ownerEmail, new Date()],
    );
    const cookie = await signIn(ownerEmail);
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).body.data.isOwner).toBe(true);
  });

  it("ends the owner's session if the account email changes", async () => {
    const email = uniqueEmail();
    const reg = await registerUser(api, { email });
    const cookie = await signIn(email);
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).status).toBe(200);
    await getPool().execute('UPDATE users SET email = ? WHERE id = ?', [uniqueEmail(), reg.user.id]);
    expect((await api.get('/api/dashboard/me').set('Cookie', cookie)).status).toBe(401);
  });
});
