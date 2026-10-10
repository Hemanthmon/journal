import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { dailyRoutineId, journalAnswerId, type Highlight } from '@journal/shared';
import { setMailer } from '../src/modules/dashboard/mailer';
import { bearer, makeApi, registerUser, uniqueEmail } from './helpers';

/** Viewers (and the owner) highlight passages and urges on diary pages. */

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
  await api.post('/api/dashboard/auth/request-code').send({ email });
  const res = await api.post('/api/dashboard/auth/verify-code').send({ email, code: codes.get(email) });
  return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
}

const DATE = '2026-10-08';
const TEXT = 'Work was hard, but I went for a walk instead of scrolling.';
let owner: string;
let viewer: string;
let other: string;
let questionId: string;
const urgeId = randomUUID();

const list = async (cookie: string) => (await api.get(`/api/dashboard/highlights?from=${DATE}&to=${DATE}`).set('Cookie', cookie)).body.data as Highlight[];

beforeAll(async () => {
  const email = uniqueEmail();
  const reg = await registerUser(api, { email, name: 'Asha' });
  const auth = bearer(reg.tokens.accessToken);
  const v = uniqueEmail();
  const o = uniqueEmail();
  await api.post('/api/dashboard-access').set(auth).send({ name: 'Ravi', email: v });
  await api.post('/api/dashboard-access').set(auth).send({ name: 'Meera', email: o });
  owner = await signIn(email);
  viewer = await signIn(v);
  other = await signIn(o);

  const data = (await api.get(`/api/dashboard/owner/data?from=${DATE}&to=${DATE}`).set('Cookie', owner)).body.data;
  const q = data.records.journalQuestions.find((x: { systemKey: string }) => x.systemKey === 'day');
  questionId = q.id;
  const put = (entity: string, record: Record<string, unknown>) => api.put(`/api/dashboard/owner/records/${entity}`).set('Cookie', owner).send({ record });
  await put('dailyRoutines', { id: dailyRoutineId(reg.user.id, DATE), localDate: DATE });
  await put('journalAnswers', {
    id: journalAnswerId(reg.user.id, DATE, q.id), routineId: dailyRoutineId(reg.user.id, DATE), questionId: q.id,
    questionTextSnapshot: q.text, questionTypeSnapshot: 'text', textValue: TEXT, emojiValue: null,
  });
  await put('urges', {
    id: urgeId, occurredAt: `${DATE}T15:00:00.000Z`, localDate: DATE, localTime: '20:30', triggerText: 'Bored', intensity: 6,
    durationMinutes: 10, actionTaken: 'Walked', outcome: 'Passed', emotionBefore: null, masturbated: false, explicitContent: false, remarks: null,
  });
});

describe('highlights', () => {
  it('a viewer highlights a passage with a note; everyone with access sees who made it', async () => {
    const start = TEXT.indexOf('I went for a walk');
    const res = await api.post('/api/dashboard/highlights').set('Cookie', viewer).send({
      kind: 'answer', date: DATE, targetId: questionId, quote: 'I went for a walk', start, end: start + 17, note: 'Proud of you!',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ author: 'Ravi', mine: true, authorIsOwner: false, note: 'Proud of you!' });
    const seenByOwner = await list(owner);
    expect(seenByOwner).toEqual([expect.objectContaining({ author: 'Ravi', mine: false, quote: 'I went for a walk' })]);
  });

  it('refuses a quote that is not at those positions (the text changed)', async () => {
    const res = await api.post('/api/dashboard/highlights').set('Cookie', viewer).send({ kind: 'answer', date: DATE, targetId: questionId, quote: 'nope', start: 0, end: 4 });
    expect(res.status).toBe(409);
  });

  it('highlights a whole urge once per person', async () => {
    const h = { kind: 'urge', date: DATE, targetId: urgeId, note: 'Good choice' };
    expect((await api.post('/api/dashboard/highlights').set('Cookie', viewer).send(h)).status).toBe(201);
    expect((await api.post('/api/dashboard/highlights').set('Cookie', viewer).send(h)).status).toBe(409);
    expect((await api.post('/api/dashboard/highlights').set('Cookie', owner).send(h)).status).toBe(201);
    expect((await list(owner)).filter((x) => x.kind === 'urge').map((x) => x.author).sort()).toEqual(['Ravi', 'You']);
  });

  it('only the author or the owner can remove a highlight', async () => {
    const ravi = (await list(viewer)).find((x) => x.kind === 'answer')!;
    expect((await api.delete(`/api/dashboard/highlights/${ravi.id}`).set('Cookie', other)).status).toBe(403);
    expect((await api.delete(`/api/dashboard/highlights/${ravi.id}`).set('Cookie', owner)).status).toBe(204);
    const ownersUrge = (await list(viewer)).find((x) => x.authorIsOwner)!;
    expect((await api.delete(`/api/dashboard/highlights/${ownersUrge.id}`).set('Cookie', viewer)).status).toBe(403);
  });

  it('needs a dashboard session', async () => {
    expect((await api.get(`/api/dashboard/highlights?from=${DATE}&to=${DATE}`)).status).toBe(401);
  });
});
