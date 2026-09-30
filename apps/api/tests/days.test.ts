import { describe, expect, it } from 'vitest';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

async function setup() {
  const { tokens } = await registerUser(api);
  const auth = bearer(tokens.accessToken);
  const questions = (await api.get('/api/journal-questions').set(auth)).body.data as { id: string; type: string }[];
  return { auth, dayQ: questions[0]!, moodQ: questions[1]!, tomorrowQ: questions[2]! };
}

describe('habit logs', () => {
  it('records partial progress and keeps one log per habit per day', async () => {
    const { auth } = await setup();
    const habit = (await api.post('/api/habits').set(auth).send({ name: 'Exercise', measurementType: 'duration', targetValue: 30 })).body.data;

    const first = await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-29', value: 15 });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ value: 15, targetSnapshot: 30, unitSnapshot: 'minutes', typeSnapshot: 'duration' });

    const again = await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-29', value: 45 });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.body.data.value).toBe(45); // above target is preserved

    const logs = await api.get('/api/habit-logs?from=2026-09-29&to=2026-09-29').set(auth);
    expect(logs.body.data).toHaveLength(1);
  });

  it('changing a habit target does not change historical logs', async () => {
    const { auth } = await setup();
    const habit = (await api.post('/api/habits').set(auth).send({ name: 'Read', measurementType: 'count', targetValue: 10, unit: 'pages' })).body.data;
    await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-01', value: 5 });
    await api.patch(`/api/habits/${habit.id}`).set(auth).send({ targetValue: 20, unit: 'chapters' });
    await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-02', value: 5 });

    const logs = (await api.get(`/api/habit-logs?habitId=${habit.id}`).set(auth)).body.data;
    expect(logs.map((l: { localDate: string; targetSnapshot: number; unitSnapshot: string }) => [l.localDate, l.targetSnapshot, l.unitSnapshot])).toEqual([
      ['2026-09-01', 10, 'pages'],
      ['2026-09-02', 20, 'chapters'],
    ]);
  });

  it('validates boolean values and edits/deletes logs', async () => {
    const { auth } = await setup();
    const habit = (await api.post('/api/habits').set(auth).send({ name: 'Wake early', measurementType: 'boolean' })).body.data;
    const bad = await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-29', value: 2 });
    expect(bad.status).toBe(400);

    const log = (await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-29', value: 1 })).body.data;
    const patched = await api.patch(`/api/habit-logs/${log.id}`).set(auth).send({ value: 0 });
    expect(patched.body.data.value).toBe(0);
    expect((await api.delete(`/api/habit-logs/${log.id}`).set(auth)).status).toBe(204);
    expect((await api.get(`/api/habit-logs/${log.id}`).set(auth)).status).toBe(404);
  });

  it("cannot log against another user's habit", async () => {
    const a = await setup();
    const b = await setup();
    const habit = (await api.post('/api/habits').set(a.auth).send({ name: 'X', measurementType: 'boolean' })).body.data;
    const res = await api.post('/api/habit-logs').set(b.auth).send({ habitId: habit.id, localDate: '2026-09-29', value: 1 });
    expect(res.status).toBe(404);
  });
});

describe('daily routines and journal answers', () => {
  it('saves an incomplete day and returns it', async () => {
    const { auth, dayQ, moodQ } = await setup();
    const put = await api
      .put('/api/daily-routines/2026-09-29')
      .set(auth)
      .send({ answers: [{ questionId: dayQ.id, textValue: 'Long day at work.\nGood dinner.' }, { questionId: moodQ.id, emojiValue: 4 }] });
    expect(put.status).toBe(200);
    expect(put.body.data.routine.localDate).toBe('2026-09-29');
    expect(put.body.data.answers).toHaveLength(2);

    // Later, add only one more answer; existing ones stay.
    const [, , tomorrowQ] = (await api.get('/api/journal-questions').set(auth)).body.data;
    await api.put('/api/daily-routines/2026-09-29').set(auth).send({ answers: [{ questionId: tomorrowQ.id, textValue: 'Sleep earlier' }] });
    const day = await api.get('/api/daily-routines/2026-09-29').set(auth);
    expect(day.body.data.answers).toHaveLength(3);
  });

  it('returns an empty day for a date with nothing recorded', async () => {
    const { auth } = await setup();
    const res = await api.get('/api/daily-routines/2026-01-01').set(auth);
    expect(res.body.data).toEqual({ localDate: '2026-01-01', routine: null, answers: [], habitLogs: [] });
  });

  it('allows one mood per day; answering again updates it', async () => {
    const { auth, moodQ } = await setup();
    await api.post('/api/journal-answers').set(auth).send({ localDate: '2026-09-29', questionId: moodQ.id, emojiValue: 2 });
    await api.post('/api/journal-answers').set(auth).send({ localDate: '2026-09-29', questionId: moodQ.id, emojiValue: 5 });
    const answers = (await api.get('/api/journal-answers?from=2026-09-29&to=2026-09-29').set(auth)).body.data;
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ emojiValue: 5, localDate: '2026-09-29' });
  });

  it('rejects out-of-range emoji values and bad dates', async () => {
    const { auth, moodQ } = await setup();
    const res = await api.post('/api/journal-answers').set(auth).send({ localDate: '2026-09-29', questionId: moodQ.id, emojiValue: 9 });
    expect(res.status).toBe(400);
    expect((await api.get('/api/daily-routines/2026-02-30').set(auth)).status).toBe(400);
  });

  it('lists days in a range, including habit logs', async () => {
    const { auth, dayQ } = await setup();
    const habit = (await api.post('/api/habits').set(auth).send({ name: 'Walk', measurementType: 'boolean' })).body.data;
    await api.put('/api/daily-routines/2026-09-10').set(auth).send({ answers: [{ questionId: dayQ.id, textValue: 'a' }] });
    await api.post('/api/habit-logs').set(auth).send({ habitId: habit.id, localDate: '2026-09-11', value: 1 });
    const res = await api.get('/api/daily-routines?from=2026-09-10&to=2026-09-11').set(auth);
    expect(res.body.data.map((d: { localDate: string }) => d.localDate)).toEqual(['2026-09-10', '2026-09-11']);
    expect(res.body.data[1].habitLogs).toHaveLength(1);
  });

  it('edits and deletes an answer', async () => {
    const { auth, dayQ } = await setup();
    const a = (await api.post('/api/journal-answers').set(auth).send({ localDate: '2026-09-20', questionId: dayQ.id, textValue: 'v1' })).body.data;
    const edited = await api.patch(`/api/journal-answers/${a.id}`).set(auth).send({ textValue: 'v2' });
    expect(edited.body.data.textValue).toBe('v2');
    expect((await api.delete(`/api/journal-answers/${a.id}`).set(auth)).status).toBe(204);
    expect((await api.get('/api/daily-routines/2026-09-20').set(auth)).body.data.answers).toHaveLength(0);
  });

  it("does not show another user's journal", async () => {
    const a = await setup();
    const b = await setup();
    await api.put('/api/daily-routines/2026-09-29').set(a.auth).send({ answers: [{ questionId: a.dayQ.id, textValue: 'secret' }] });
    const res = await api.get('/api/daily-routines/2026-09-29').set(b.auth);
    expect(res.body.data.answers).toHaveLength(0);
    const cross = await api.put('/api/daily-routines/2026-09-29').set(b.auth).send({ answers: [{ questionId: a.dayQ.id, textValue: 'x' }] });
    expect(cross.status).toBe(404);
  });
});
