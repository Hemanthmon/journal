import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dailyRoutineId, habitLogId, journalAnswerId, type PullResponse, type PushResult } from '@journal/shared';
import { bearer, makeApi, registerUser } from './helpers';

const api = makeApi();

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function setup() {
  const { tokens, user, password } = await registerUser(api);
  const auth = bearer(tokens.accessToken);
  return { auth, userId: user.id, password };
}

function habitRecord(overrides: Record<string, unknown> = {}) {
  const now = iso();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: 'Exercise',
    description: null,
    measurementType: 'duration',
    targetValue: 30,
    unit: 'minutes',
    scheduleDays: [1, 2, 3, 4, 5, 6],
    isActive: true,
    archivedAt: null,
    displayOrder: 0,
    ...overrides,
  };
}

const change = (entity: string, record: Record<string, unknown>, baseSeq: number | null = null) => ({
  changeId: randomUUID(),
  entity,
  baseSeq,
  record,
});

async function push(auth: Record<string, string>, changes: unknown[], epoch = 1) {
  return api.post('/api/sync/push').set(auth).send({ epoch, changes });
}

async function pull(auth: Record<string, string>, cursor = 0, limit?: number): Promise<PullResponse> {
  const res = await api.get(`/api/sync/pull?cursor=${cursor}${limit ? `&limit=${limit}` : ''}`).set(auth);
  expect(res.status).toBe(200);
  return res.body.data;
}

describe('sync push/pull', () => {
  it('pushes a full offline day (habit, log, routine, answers, urge) and pulls it back', async () => {
    const { auth, userId } = await setup();
    const initial = await pull(auth);
    expect(initial.changes.map((c) => c.entity)).toEqual(Array(4).fill('journalQuestions'));
    const [dayQ, moodQ] = initial.changes.map((c) => c.record);

    const now = iso();
    const habit = habitRecord();
    const date = '2026-09-29';
    const routineId = dailyRoutineId(userId, date);
    const changes = [
      change('habits', habit),
      change('habitLogs', {
        id: habitLogId(userId, habit.id, date),
        createdAt: now, updatedAt: now, deletedAt: null,
        habitId: habit.id, localDate: date, value: 15, targetSnapshot: 30, unitSnapshot: 'minutes', typeSnapshot: 'duration',
      }),
      change('dailyRoutines', { id: routineId, createdAt: now, updatedAt: now, deletedAt: null, localDate: date }),
      change('journalAnswers', {
        id: journalAnswerId(userId, date, dayQ!.id as string),
        createdAt: now, updatedAt: now, deletedAt: null,
        routineId, questionId: dayQ!.id, questionTextSnapshot: dayQ!.text, questionTypeSnapshot: 'text',
        textValue: 'Written offline', emojiValue: null,
      }),
      change('journalAnswers', {
        id: journalAnswerId(userId, date, moodQ!.id as string),
        createdAt: now, updatedAt: now, deletedAt: null,
        routineId, questionId: moodQ!.id, questionTextSnapshot: moodQ!.text, questionTypeSnapshot: 'emoji',
        textValue: null, emojiValue: 4,
      }),
      change('urges', {
        id: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null,
        occurredAt: now, localDate: date, localTime: '22:10', triggerText: null, intensity: 5,
        actionTaken: null, outcome: null, emotionBefore: null, masturbated: null, explicitContent: null, remarks: null,
      }),
    ];
    const res = await push(auth, changes);
    expect(res.status).toBe(200);
    expect(res.body.data.results.map((r: PushResult) => r.status)).toEqual(Array(6).fill('applied'));

    const after = await pull(auth, initial.nextCursor);
    expect(after.changes.map((c) => c.entity)).toEqual([
      'habits', 'habitLogs', 'dailyRoutines', 'journalAnswers', 'journalAnswers', 'urges',
    ]);
    expect(after.hasMore).toBe(false);

    // Incremental: nothing new since the cursor.
    const again = await pull(auth, after.nextCursor);
    expect(again.changes).toHaveLength(0);
    expect(again.nextCursor).toBe(after.nextCursor);

    // The records are visible through the normal API too.
    const day = await api.get(`/api/daily-routines/${date}`).set(auth);
    expect(day.body.data.answers.map((a: { textValue: string | null }) => a.textValue)).toContain('Written offline');
  });

  it('is idempotent: retrying the same change does not apply it twice', async () => {
    const { auth } = await setup();
    const ch = change('habits', habitRecord());
    const first = await push(auth, [ch]);
    const retry = await push(auth, [ch]);
    expect(retry.body.data.results[0]).toEqual(first.body.data.results[0]);
    const habits = (await api.get('/api/habits').set(auth)).body.data;
    expect(habits).toHaveLength(1);
  });

  it('treats an identical re-send (new changeId) as a no-op without a new version', async () => {
    const { auth } = await setup();
    const rec = habitRecord();
    const a = (await push(auth, [change('habits', rec)])).body.data.results[0];
    const b = (await push(auth, [change('habits', { ...rec, updatedAt: iso(1000) })])).body.data.results[0];
    expect(b).toMatchObject({ status: 'applied', serverSeq: a.serverSeq });
  });

  it('last write wins for ordinary edits; older edits come back as stale', async () => {
    const { auth } = await setup();
    const rec = habitRecord({ updatedAt: iso(-60_000) });
    await push(auth, [change('habits', rec)]);

    const newer = await push(auth, [change('habits', { ...rec, name: 'Newer', updatedAt: iso() })]);
    expect(newer.body.data.results[0].status).toBe('applied');

    const older = await push(auth, [change('habits', { ...rec, name: 'Older', updatedAt: iso(-30_000) })]);
    expect(older.body.data.results[0]).toMatchObject({ status: 'stale', record: { name: 'Newer' } });
  });

  it('detects conflicting journal edits instead of overwriting them', async () => {
    const { auth, userId } = await setup();
    const [dayQ] = (await pull(auth)).changes.map((c) => c.record);
    const date = '2026-09-28';
    const routineId = dailyRoutineId(userId, date);
    const now = iso();
    const answer = (text: string, updatedAt: string) => ({
      id: journalAnswerId(userId, date, dayQ!.id as string),
      createdAt: now, updatedAt, deletedAt: null,
      routineId, questionId: dayQ!.id, questionTextSnapshot: dayQ!.text, questionTypeSnapshot: 'text',
      textValue: text, emojiValue: null,
    });
    await push(auth, [change('dailyRoutines', { id: routineId, createdAt: now, updatedAt: now, deletedAt: null, localDate: date })]);

    // Phone writes first.
    const phone = await push(auth, [change('journalAnswers', answer('From my phone', iso()))]);
    const phoneSeq = phone.body.data.results[0].serverSeq as number;

    // Tablet wrote offline without having seen the phone's version — even with a later timestamp.
    const tablet = await push(auth, [change('journalAnswers', answer('From my tablet', iso(1000)), null)]);
    expect(tablet.body.data.results[0]).toMatchObject({ status: 'conflict', record: { textValue: 'From my phone' } });

    // Server copy is untouched.
    const day = await api.get(`/api/daily-routines/${date}`).set(auth);
    expect(day.body.data.answers[0].textValue).toBe('From my phone');

    // After the user resolves it (having now seen phoneSeq), the save goes through.
    const resolved = await push(auth, [change('journalAnswers', answer('Phone + tablet merged', iso(2000)), phoneSeq)]);
    expect(resolved.body.data.results[0].status).toBe('applied');
  });

  it('keeps deleted records deleted, even if an older device edits them later', async () => {
    const { auth } = await setup();
    const rec = habitRecord();
    await push(auth, [change('habits', rec)]);
    const cursor = (await pull(auth)).nextCursor;
    const del = await push(auth, [change('habits', { ...rec, deletedAt: iso(1000), updatedAt: iso(1000) })]);
    expect(del.body.data.results[0].status).toBe('applied');

    const lateEdit = await push(auth, [change('habits', { ...rec, name: 'Edited offline', updatedAt: iso(5000) })]);
    expect(lateEdit.body.data.results[0].status).toBe('stale');

    const changes = (await pull(auth, cursor)).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]!.record.deletedAt).toEqual(expect.any(String));
    expect((await api.get('/api/habits').set(auth)).body.data).toHaveLength(0);
  });

  it('rejects bad changes individually without failing the batch', async () => {
    const a = await setup();
    const b = await setup();
    const aHabit = habitRecord();
    await push(a.auth, [change('habits', aHabit)]);

    const good = habitRecord({ name: 'Good' });
    const res = await push(b.auth, [
      change('habits', { ...habitRecord(), targetValue: -1 }),
      change('habitLogs', {
        id: randomUUID(), createdAt: iso(), updatedAt: iso(), deletedAt: null,
        habitId: randomUUID(), localDate: '2026-09-29', value: 1, targetSnapshot: 1, unitSnapshot: null, typeSnapshot: 'boolean',
      }),
      change('habits', { ...aHabit, name: 'Stolen' }),
      change('notATable', { id: randomUUID() }),
      change('habits', good),
    ]);
    expect(res.body.data.results.map((r: PushResult) => [r.status, r.errorCode])).toEqual([
      ['rejected', 'INVALID'],
      ['rejected', 'MISSING_PARENT'],
      ['rejected', 'ID_CONFLICT'],
      ['rejected', 'UNKNOWN_ENTITY'],
      ['applied', undefined],
    ]);
    expect((await api.get('/api/habits').set(a.auth)).body.data[0].name).toBe('Exercise');
  });

  it('pages through changes with a cursor', async () => {
    const { auth } = await setup();
    const base = (await pull(auth)).nextCursor;
    await push(auth, [1, 2, 3, 4, 5].map((i) => change('habits', habitRecord({ name: `H${i}`, displayOrder: i }))));

    const seen: string[] = [];
    let cursor = base;
    let pages = 0;
    for (;;) {
      const page = await pull(auth, cursor, 2);
      seen.push(...page.changes.map((c) => c.record.name as string));
      cursor = page.nextCursor;
      pages++;
      if (!page.hasMore) break;
    }
    expect(seen).toEqual(['H1', 'H2', 'H3', 'H4', 'H5']);
    expect(pages).toBe(3);
  });

  it("never returns another user's data", async () => {
    const a = await setup();
    const b = await setup();
    await push(a.auth, [change('habits', habitRecord({ name: 'Private habit' }))]);
    const bChanges = (await pull(b.auth)).changes;
    expect(JSON.stringify(bChanges)).not.toContain('Private habit');
  });

  it('clamps timestamps from devices with clocks far in the future', async () => {
    const { auth } = await setup();
    const rec = habitRecord({ updatedAt: iso(365 * 24 * 3600 * 1000) });
    await push(auth, [change('habits', rec)]);
    const [h] = (await api.get('/api/habits').set(auth)).body.data;
    expect(Date.parse(h.updatedAt)).toBeLessThan(Date.now() + 10 * 60 * 1000);
  });

  it('requires authentication', async () => {
    expect((await api.get('/api/sync/pull')).status).toBe(401);
    expect((await api.post('/api/sync/push').send({ epoch: 1, changes: [] })).status).toBe(401);
  });
});

describe('reminders', () => {
  it('sync like other records, including soft deletes', async () => {
    const { auth } = await setup();
    const base = (await pull(auth)).nextCursor;
    const now = iso();
    const rec = { id: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, text: 'Phone stays outside the bedroom', isActive: true, displayOrder: 0 };
    const res = await push(auth, [change('reminders', rec), change('reminders', { ...rec, id: randomUUID(), text: '' })]);
    expect(res.body.data.results.map((r: PushResult) => [r.status, r.errorCode])).toEqual([
      ['applied', undefined],
      ['rejected', 'INVALID'],
    ]);
    const pulled = await pull(auth, base);
    expect(pulled.changes.map((c) => [c.entity, c.record.text])).toEqual([['reminders', 'Phone stays outside the bedroom']]);

    await push(auth, [change('reminders', { ...rec, deletedAt: iso(1000), updatedAt: iso(1000) })]);
    const late = await push(auth, [change('reminders', { ...rec, text: 'edited offline', updatedAt: iso(5000) })]);
    expect(late.body.data.results[0].status).toBe('stale');
  });
});

describe('account data deletion', () => {
  it('deletes personal data, bumps the epoch, and makes old devices re-download', async () => {
    const { auth, password } = await setup();
    await push(auth, [change('habits', habitRecord())]);

    expect((await api.delete('/api/account/data').set(auth).send({ password: 'wrong-password' })).status).toBe(401);
    const res = await api.delete('/api/account/data').set(auth).send({ password });
    expect(res.status).toBe(200);
    expect(res.body.data.epoch).toBe(2);

    expect((await api.get('/api/habits').set(auth)).body.data).toHaveLength(0);
    const stalePush = await push(auth, [change('habits', habitRecord())], 1);
    expect(stalePush.status).toBe(409);
    expect(stalePush.body.error.code).toBe('EPOCH_CHANGED');

    const fresh = await pull(auth);
    expect(fresh.epoch).toBe(2);
    expect(fresh.changes.map((c) => c.entity)).toEqual(Array(4).fill('journalQuestions'));
  });

  it('deletes the whole account', async () => {
    const { auth, password } = await setup();
    await push(auth, [change('habits', habitRecord())]);
    const res = await api.delete('/api/account').set(auth).send({ password });
    expect(res.status).toBe(204);
    expect((await api.get('/api/profile').set(auth)).status).toBe(404);
  });
});
