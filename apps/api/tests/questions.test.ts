import { describe, expect, it } from 'vitest';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

async function user() {
  const { tokens } = await registerUser(api);
  return bearer(tokens.accessToken);
}

describe('journal questions', () => {
  it('lists the four default questions for a new user', async () => {
    const auth = await user();
    const res = await api.get('/api/journal-questions').set(auth);
    expect(res.body.data.map((q: { text: string; type: string }) => [q.text, q.type])).toEqual([
      ['How was your day? Tell us about it.', 'text'],
      ['How are you feeling today?', 'emoji'],
      ["What's one thing you could do better tomorrow?", 'text'],
      ['What are you grateful for today?', 'text'],
    ]);
    expect(res.body.data[1].systemKey).toBe('mood');
  });

  it('adds, edits, requires, disables and reorders questions', async () => {
    const auth = await user();
    const created = await api.post('/api/journal-questions').set(auth).send({ text: 'Did you sleep well?', type: 'emoji' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ isRequired: false, isActive: true, displayOrder: 5, systemKey: null });

    const url = `/api/journal-questions/${created.body.data.id}`;
    const edited = await api.patch(url).set(auth).send({ text: 'How did you sleep?', isRequired: true, isActive: false });
    expect(edited.body.data).toMatchObject({ text: 'How did you sleep?', isRequired: true, isActive: false });

    const all = (await api.get('/api/journal-questions').set(auth)).body.data as { id: string }[];
    const ids = all.map((q) => q.id).reverse();
    const reordered = await api.post('/api/journal-questions/reorder').set(auth).send({ ids });
    expect(reordered.body.data[0].id).toBe(created.body.data.id);
  });

  it('cannot change the built-in system key', async () => {
    const auth = await user();
    const [first] = (await api.get('/api/journal-questions').set(auth)).body.data;
    const res = await api.patch(`/api/journal-questions/${first.id}`).set(auth).send({ systemKey: 'mood' });
    expect(res.status).toBe(400);
  });

  it('keeps previous answers readable after the question is edited or deleted', async () => {
    const auth = await user();
    const [dayQ] = (await api.get('/api/journal-questions').set(auth)).body.data;
    await api.put('/api/daily-routines/2026-09-01').set(auth).send({ answers: [{ questionId: dayQ.id, textValue: 'A calm day.' }] });

    await api.patch(`/api/journal-questions/${dayQ.id}`).set(auth).send({ text: 'Describe your day' });
    await api.delete(`/api/journal-questions/${dayQ.id}`).set(auth);

    const day = await api.get('/api/daily-routines/2026-09-01').set(auth);
    expect(day.body.data.answers).toHaveLength(1);
    expect(day.body.data.answers[0]).toMatchObject({
      textValue: 'A calm day.',
      questionTextSnapshot: 'How was your day? Tell us about it.',
    });
    const list = (await api.get('/api/journal-questions').set(auth)).body.data;
    expect(list.map((q: { id: string }) => q.id)).not.toContain(dayQ.id);
  });

  it("cannot touch another user's questions", async () => {
    const a = await user();
    const b = await user();
    const [q] = (await api.get('/api/journal-questions').set(a)).body.data;
    expect((await api.patch(`/api/journal-questions/${q.id}`).set(b).send({ text: 'x' })).status).toBe(404);
    expect((await api.delete(`/api/journal-questions/${q.id}`).set(b)).status).toBe(404);
  });
});
