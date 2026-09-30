import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

async function user() {
  const { tokens } = await registerUser(api);
  return bearer(tokens.accessToken);
}

const urge = (overrides: Record<string, unknown> = {}) => ({
  localDate: '2026-09-29',
  localTime: '21:30',
  intensity: 6,
  triggerText: 'Bored, alone',
  actionTaken: 'Went for a walk',
  outcome: 'Passed after 10 minutes',
  emotionBefore: 'Restless',
  masturbated: false,
  explicitContent: false,
  remarks: null,
  ...overrides,
});

describe('urge tracker', () => {
  it('records several urges on the same day, quickly (only date/time/intensity required)', async () => {
    const auth = await user();
    const full = await api.post('/api/urges').set(auth).send(urge());
    expect(full.status).toBe(201);
    expect(full.body.data).toMatchObject({ localTime: '21:30:00', intensity: 6, masturbated: false });
    expect(full.body.data.occurredAt).toEqual(expect.any(String));

    const quick = await api.post('/api/urges').set(auth).send({ localDate: '2026-09-29', localTime: '23:05', intensity: 3 });
    expect(quick.status).toBe(201);
    expect(quick.body.data).toMatchObject({ triggerText: null, masturbated: null });

    const list = await api.get('/api/urges?from=2026-09-29&to=2026-09-29').set(auth);
    expect(list.body.data.map((u: { localTime: string }) => u.localTime)).toEqual(['23:05:00', '21:30:00']);
  });

  it.each([[{ intensity: 11 }], [{ intensity: -1 }], [{ localTime: '25:00' }], [{ localDate: '29-09-2026' }], [{ score: 5 }]])(
    'rejects invalid input %j',
    async (override) => {
      const auth = await user();
      expect((await api.post('/api/urges').set(auth).send(urge(override))).status).toBe(400);
    },
  );

  it('edits and deletes an urge', async () => {
    const auth = await user();
    const created = (await api.post('/api/urges').set(auth).send(urge())).body.data;
    const edited = await api.patch(`/api/urges/${created.id}`).set(auth).send({ intensity: 2, remarks: 'Easier than expected' });
    expect(edited.body.data).toMatchObject({ intensity: 2, remarks: 'Easier than expected', triggerText: 'Bored, alone' });
    expect((await api.delete(`/api/urges/${created.id}`).set(auth)).status).toBe(204);
    expect((await api.get('/api/urges').set(auth)).body.data).toHaveLength(0);
  });

  it('filters by date range', async () => {
    const auth = await user();
    for (const d of ['2026-09-01', '2026-09-15', '2026-09-30']) await api.post('/api/urges').set(auth).send(urge({ localDate: d }));
    const res = await api.get('/api/urges?from=2026-09-10&to=2026-09-20').set(auth);
    expect(res.body.data.map((u: { localDate: string }) => u.localDate)).toEqual(['2026-09-15']);
    expect((await api.get('/api/urges?from=2026-09-20&to=2026-09-10').set(auth)).status).toBe(400);
  });

  it('handles duplicate create requests idempotently', async () => {
    const auth = await user();
    const body = urge({ id: randomUUID() });
    expect((await api.post('/api/urges').set(auth).send(body)).status).toBe(201);
    expect((await api.post('/api/urges').set(auth).send(body)).status).toBe(200);
    expect((await api.get('/api/urges').set(auth)).body.data).toHaveLength(1);
  });

  it("keeps urges private to their owner", async () => {
    const a = await user();
    const b = await user();
    const created = (await api.post('/api/urges').set(a).send(urge())).body.data;
    expect((await api.get(`/api/urges/${created.id}`).set(b)).status).toBe(404);
    expect((await api.patch(`/api/urges/${created.id}`).set(b).send({ intensity: 0 })).status).toBe(404);
    expect((await api.delete(`/api/urges/${created.id}`).set(b)).status).toBe(404);
    expect((await api.get('/api/urges').set(b)).body.data).toHaveLength(0);
  });
});
