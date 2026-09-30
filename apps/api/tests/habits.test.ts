import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

async function user() {
  const { tokens, user } = await registerUser(api);
  return { auth: bearer(tokens.accessToken), userId: user.id };
}

describe('habits CRUD', () => {
  it('creates each measurement type with sensible defaults', async () => {
    const { auth } = await user();
    const meditation = await api
      .post('/api/habits')
      .set(auth)
      .send({ name: 'Meditation', measurementType: 'duration', targetValue: 10 });
    expect(meditation.status).toBe(201);
    expect(meditation.body.data).toMatchObject({
      name: 'Meditation',
      measurementType: 'duration',
      targetValue: 10,
      unit: 'minutes',
      scheduleDays: [1, 2, 3, 4, 5, 6, 7],
      isActive: true,
      archivedAt: null,
      displayOrder: 0,
    });

    const reading = await api
      .post('/api/habits')
      .set(auth)
      .send({ name: 'Reading', measurementType: 'count', targetValue: 10, unit: 'pages', scheduleDays: [5, 1, 3, 2, 4, 1] });
    expect(reading.body.data).toMatchObject({ unit: 'pages', scheduleDays: [1, 2, 3, 4, 5], displayOrder: 1 });

    const water = await api
      .post('/api/habits')
      .set(auth)
      .send({ name: 'Drink water', measurementType: 'quantity', targetValue: 2, unit: 'litres' });
    expect(water.body.data).toMatchObject({ targetValue: 2, unit: 'litres' });

    const wake = await api.post('/api/habits').set(auth).send({ name: 'Wake up early', measurementType: 'boolean' });
    expect(wake.body.data).toMatchObject({ targetValue: 1, unit: null });
  });

  it.each([
    [{ name: '', measurementType: 'count', targetValue: 1 }, 'name'],
    [{ name: 'X', measurementType: 'count' }, 'targetValue'],
    [{ name: 'X', measurementType: 'count', targetValue: 0 }, 'targetValue'],
    [{ name: 'X', measurementType: 'count', targetValue: 1.234 }, 'targetValue'],
    [{ name: 'X', measurementType: 'quantity', targetValue: 2 }, 'unit'],
    [{ name: 'X', measurementType: 'boolean', targetValue: 3 }, 'targetValue'],
    [{ name: 'X', measurementType: 'count', targetValue: 1, scheduleDays: [] }, 'scheduleDays'],
    [{ name: 'X', measurementType: 'count', targetValue: 1, scheduleDays: [8] }, 'scheduleDays.0'],
    [{ name: 'X', measurementType: 'distance', targetValue: 1 }, 'measurementType'],
  ])('rejects invalid habit %j', async (body, path) => {
    const { auth } = await user();
    const res = await api.post('/api/habits').set(auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });

  it('is idempotent when retried with the same client id', async () => {
    const { auth } = await user();
    const id = randomUUID();
    const body = { id, name: 'Exercise', measurementType: 'duration', targetValue: 30 };
    const first = await api.post('/api/habits').set(auth).send(body);
    const retry = await api.post('/api/habits').set(auth).send(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(id);
    const list = await api.get('/api/habits').set(auth);
    expect(list.body.data).toHaveLength(1);
  });

  it('refuses an id that belongs to another user, without leaking it', async () => {
    const a = await user();
    const b = await user();
    const id = randomUUID();
    await api.post('/api/habits').set(a.auth).send({ id, name: 'Mine', measurementType: 'boolean' });
    const res = await api.post('/api/habits').set(b.auth).send({ id, name: 'Theirs', measurementType: 'boolean' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('Mine');
  });

  it('edits fields, including schedule and target', async () => {
    const { auth } = await user();
    const { body } = await api.post('/api/habits').set(auth).send({ name: 'Exercise', measurementType: 'duration', targetValue: 30 });
    const res = await api
      .patch(`/api/habits/${body.data.id}`)
      .set(auth)
      .send({ targetValue: 45, scheduleDays: [1, 2, 3, 4, 5, 6], description: 'Gym or run' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ targetValue: 45, scheduleDays: [1, 2, 3, 4, 5, 6], description: 'Gym or run' });
    expect(res.body.data.serverSeq).toBeGreaterThan(body.data.serverSeq);
  });

  it('switching to a yes/no habit resets the target to 1', async () => {
    const { auth } = await user();
    const { body } = await api.post('/api/habits').set(auth).send({ name: 'Walk', measurementType: 'count', targetValue: 5 });
    const res = await api.patch(`/api/habits/${body.data.id}`).set(auth).send({ measurementType: 'boolean' });
    expect(res.body.data).toMatchObject({ measurementType: 'boolean', targetValue: 1, unit: null });
  });

  it('disables, archives and restores', async () => {
    const { auth } = await user();
    const { body } = await api.post('/api/habits').set(auth).send({ name: 'Yoga', measurementType: 'boolean' });
    const url = `/api/habits/${body.data.id}`;
    expect((await api.patch(url).set(auth).send({ isActive: false })).body.data.isActive).toBe(false);
    const archived = await api.patch(url).set(auth).send({ archived: true });
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));
    const restored = await api.patch(url).set(auth).send({ archived: false });
    expect(restored.body.data.archivedAt).toBeNull();
  });

  it('reorders habits', async () => {
    const { auth } = await user();
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push((await api.post('/api/habits').set(auth).send({ name, measurementType: 'boolean' })).body.data.id);
    }
    const res = await api.post('/api/habits/reorder').set(auth).send({ ids: [ids[2], ids[0], ids[1]] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { name: string }) => h.name)).toEqual(['C', 'A', 'B']);
    const dup = await api.post('/api/habits/reorder').set(auth).send({ ids: [ids[0], ids[0]] });
    expect(dup.status).toBe(400);
  });

  it('soft-deletes: gone from lists, history kept, repeat delete is fine', async () => {
    const { auth } = await user();
    const { body } = await api.post('/api/habits').set(auth).send({ name: 'Run', measurementType: 'duration', targetValue: 20 });
    const id = body.data.id;
    await api.post('/api/habit-logs').set(auth).send({ habitId: id, localDate: '2026-09-01', value: 20 });

    expect((await api.delete(`/api/habits/${id}`).set(auth)).status).toBe(204);
    expect((await api.delete(`/api/habits/${id}`).set(auth)).status).toBe(204);
    expect((await api.get(`/api/habits/${id}`).set(auth)).status).toBe(404);
    expect((await api.patch(`/api/habits/${id}`).set(auth).send({ name: 'x' })).status).toBe(404);
    expect((await api.get('/api/habits').set(auth)).body.data).toHaveLength(0);

    const logs = await api.get(`/api/habit-logs?habitId=${id}`).set(auth);
    expect(logs.body.data).toHaveLength(1);
  });
});

describe('habits authorization', () => {
  it("cannot read, edit, reorder or delete another user's habit", async () => {
    const a = await user();
    const b = await user();
    const { body } = await api.post('/api/habits').set(a.auth).send({ name: 'Private', measurementType: 'boolean' });
    const url = `/api/habits/${body.data.id}`;

    expect((await api.get(url).set(b.auth)).status).toBe(404);
    expect((await api.patch(url).set(b.auth).send({ name: 'Hacked' })).status).toBe(404);
    expect((await api.delete(url).set(b.auth)).status).toBe(404);
    expect((await api.post('/api/habits/reorder').set(b.auth).send({ ids: [body.data.id] })).status).toBe(404);
    expect((await api.get('/api/habits').set(b.auth)).body.data).toHaveLength(0);

    const still = await api.get(url).set(a.auth);
    expect(still.body.data.name).toBe('Private');
  });

  it('returns 404 for malformed ids', async () => {
    const { auth } = await user();
    expect((await api.get('/api/habits/not-a-uuid').set(auth)).status).toBe(404);
  });
});
