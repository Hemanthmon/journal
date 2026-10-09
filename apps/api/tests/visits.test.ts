import { beforeAll, describe, expect, it } from 'vitest';
import type { DashboardActivity } from '@journal/shared';
import { getPool } from '../src/db/pool';
import { setMailer } from '../src/modules/dashboard/mailer';
import { deviceOf, resetVisitCache } from '../src/modules/dashboard/visits';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** The owner sees when people they shared with signed in, and for how long. */

const api = makeApi();
const codes = new Map<string, string>();
setMailer({
  async sendLoginCode(to, mail) {
    codes.set(to, mail.code);
  },
  async sendInvite() {},
  async sendUrgeNote() {},
});

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
let ownerAuth: Record<string, string>;
let ownerEmail: string;
let viewer: string;

async function signIn(email: string, ua = CHROME_WIN) {
  await api.post('/api/dashboard/auth/request-code').send({ email });
  const res = await api.post('/api/dashboard/auth/verify-code').set('User-Agent', ua).send({ email, code: codes.get(email) });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

const activity = async () => (await api.get('/api/dashboard-access/activity').set(ownerAuth)).body.data as DashboardActivity;

beforeAll(async () => {
  ownerEmail = uniqueEmail();
  const reg = await registerUser(api, { email: ownerEmail });
  ownerAuth = bearer(reg.tokens.accessToken);
  viewer = uniqueEmail();
  await api.post('/api/dashboard-access').set(ownerAuth).send({ name: 'Ravi', email: viewer });
  resetVisitCache();
});

describe('viewer activity', () => {
  it('names the browser and device without anything more precise', () => {
    expect(deviceOf(CHROME_WIN)).toBe('Chrome on Windows');
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceOf(undefined)).toBeNull();
  });

  it('records a sign-in, extends the visit with activity, and starts a new one after a long gap', async () => {
    const cookie = await signIn(viewer);
    let a = await activity();
    expect(a.viewers).toHaveLength(1);
    expect(a.viewers[0]).toMatchObject({ email: viewer, name: 'Ravi', hasAccess: true });
    expect(a.viewers[0]!.visits[0]).toMatchObject({ signedIn: true, device: 'Chrome on Windows', minutes: 1 });

    // 20 minutes on the dashboard: pretend the visit began earlier, then send a heartbeat.
    await getPool().execute(
      'UPDATE dashboard_visits SET started_at = DATE_SUB(started_at, INTERVAL 20 MINUTE), last_seen_at = DATE_SUB(last_seen_at, INTERVAL 1 MINUTE) WHERE viewer_email = ?',
      [viewer],
    );
    resetVisitCache();
    expect((await api.post('/api/dashboard/heartbeat').set('Cookie', cookie)).status).toBe(204);
    a = await activity();
    expect(a.viewers[0]!.visits).toHaveLength(1);
    expect(a.viewers[0]!.visits[0]!.minutes).toBeGreaterThanOrEqual(20);
    expect(a.viewers[0]!.weekMinutes).toBeGreaterThanOrEqual(20);

    // An hour away, then back: a second visit (no new sign-in needed).
    await getPool().execute('UPDATE dashboard_visits SET last_seen_at = DATE_SUB(last_seen_at, INTERVAL 60 MINUTE) WHERE viewer_email = ?', [viewer]);
    resetVisitCache();
    await api.get('/api/dashboard/me').set('Cookie', cookie);
    a = await activity();
    expect(a.viewers[0]!.visits.map((v) => v.signedIn)).toEqual([false, true]);
  });

  it("doesn't track the owner's own visits, and other owners can't see this", async () => {
    await signIn(ownerEmail);
    expect((await activity()).viewers.map((v) => v.email)).toEqual([viewer]);
    const other = await registerUser(api, { email: uniqueEmail() });
    const theirs = (await api.get('/api/dashboard-access/activity').set(bearer(other.tokens.accessToken))).body.data as DashboardActivity;
    expect(theirs.viewers).toEqual([]);
  });
});
