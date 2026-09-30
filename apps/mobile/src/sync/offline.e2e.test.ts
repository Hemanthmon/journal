/**
 * End-to-end offline scenario against the real API and MySQL test database:
 *
 *   1. Create a habit while offline.      5. Reconnect.
 *   2. Complete the habit while offline.  6. Confirm all records synchronise.
 *   3. Write a journal entry offline.     7. Restart the app.
 *   4. Record an urge while offline.      8. Confirm the records remain available.
 *
 * Plus failed syncs, duplicate retries, conflicting edits and deletions across two devices.
 * Requires apps/api/.env.test (the same database the API tests use).
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/nodeDb';
import { makeCtx } from '../test/ctx';
import { httpTransport } from '../test/httpTransport';
import { createHabit, deleteHabit, habitsForDate, listHabits, setHabitValue } from '../data/habits';
import { getJournalDay, listQuestions, saveAnswer } from '../data/journal';
import { createUrge, listUrges } from '../data/urges';
import { SyncEngine } from './engine';
import { listConflicts, resolveConflict } from './conflicts';

// Imported at runtime by path so the mobile typecheck doesn't pull in server code.
const API_DIR = path.resolve(__dirname, '../../../api/src');

let server: Server;
let baseUrl: string;
let closePool: () => Promise<void>;
const tmp = mkdtempSync(path.join(tmpdir(), 'journal-e2e-'));

beforeAll(async () => {
  const { migrate } = await import(path.join(API_DIR, 'db/migrate.ts'));
  await migrate();
  const { createApp } = await import(path.join(API_DIR, 'app.ts'));
  ({ closePool } = await import(path.join(API_DIR, 'db/pool.ts')));
  await new Promise<void>((resolve) => {
    server = createApp({ authRateLimitMax: 1000 }).listen(0, resolve);
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await closePool();
  rmSync(tmp, { recursive: true, force: true });
});

async function register() {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E', email: `e2e-${randomUUID()}@example.com`, password: 'e2e-password-1' }),
  });
  const body = (await res.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
  return { userId: body.data.user.id, token: body.data.tokens.accessToken };
}

/** A "device": its own SQLite file, sync engine and network switch. */
async function device(userId: string, token: string, file = path.join(tmp, `${randomUUID()}.db`)) {
  const db = await createTestDb(file);
  const ctx = makeCtx(db, userId, new Date());
  const net = httpTransport(baseUrl, token);
  const engine = new SyncEngine({ db, userId, transport: net.transport, isOnline: () => net.state.online });
  return { db, ctx, net, engine, file };
}

describe('offline-first end to end', () => {
  it('creates everything offline, syncs on reconnect, and survives a restart', async () => {
    const { userId, token } = await register();
    const phone = await device(userId, token);
    const today = '2026-09-29';

    // First launch online: download default questions.
    await phone.engine.sync();
    const questions = await listQuestions(phone.ctx);
    expect(questions).toHaveLength(4);

    // Go offline.
    phone.net.state.online = false;
    const habit = await createHabit(phone.ctx, { name: 'Exercise', measurementType: 'duration', targetValue: 30 }); // 1
    await setHabitValue(phone.ctx, habit, today, 15); // 2
    await saveAnswer(phone.ctx, today, questions[0]!, { textValue: 'Wrote this on a plane.' }); // 3
    await saveAnswer(phone.ctx, today, questions[1]!, { emojiValue: 4 });
    await createUrge(phone.ctx, { localDate: today, localTime: '22:15', intensity: 6, triggerText: 'Tired' }); // 4

    const offline = await phone.engine.sync();
    expect(offline).toMatchObject({ phase: 'offline', pending: 6 });

    // 5-6. Reconnect and sync.
    phone.net.state.online = true;
    const synced = await phone.engine.sync();
    expect(synced).toMatchObject({ phase: 'idle', pending: 0, conflicts: 0, rejected: 0 });

    const auth = { Authorization: `Bearer ${token}` };
    const day = (await (await fetch(`${baseUrl}/api/daily-routines/${today}`, { headers: auth })).json()) as {
      data: { answers: { textValue: string | null; emojiValue: number | null }[]; habitLogs: { value: number }[] };
    };
    expect(day.data.answers.map((a) => a.textValue ?? a.emojiValue)).toEqual(
      expect.arrayContaining(['Wrote this on a plane.', 4]),
    );
    expect(day.data.habitLogs[0]?.value).toBe(15);
    const urges = (await (await fetch(`${baseUrl}/api/urges`, { headers: auth })).json()) as { data: unknown[] };
    expect(urges.data).toHaveLength(1);

    // 7-8. "Restart": close and reopen the same database file, offline.
    phone.db.close();
    const restarted = await device(userId, token, phone.file);
    restarted.net.state.online = false;
    expect((await listHabits(restarted.ctx)).map((h) => h.name)).toEqual(['Exercise']);
    expect((await habitsForDate(restarted.ctx, today))[0]?.value).toBe(15);
    expect((await getJournalDay(restarted.ctx, today)).questions[0]?.answer?.textValue).toBe('Wrote this on a plane.');
    expect(await listUrges(restarted.ctx)).toHaveLength(1);
    restarted.db.close();
  });

  it('a second device downloads everything, and deletions propagate without resurrection', async () => {
    const { userId, token } = await register();
    const a = await device(userId, token);
    const b = await device(userId, token);
    await a.engine.sync();
    const habit = await createHabit(a.ctx, { name: 'Shared habit', measurementType: 'boolean' });
    await a.engine.sync();

    await b.engine.sync();
    expect((await listHabits(b.ctx)).map((h) => h.name)).toEqual(['Shared habit']);

    // A deletes; B (offline) edits the same habit later; B's edit must not bring it back.
    await deleteHabit(a.ctx, habit.id);
    await a.engine.sync();
    b.net.state.online = false;
    b.ctx.advance(60_000);
    const { updateHabit } = await import('../data/habits');
    await updateHabit(b.ctx, habit.id, { name: 'Edited offline' });
    b.net.state.online = true;
    await b.engine.sync();
    expect(await listHabits(b.ctx)).toHaveLength(0);
    await a.engine.sync();
    expect(await listHabits(a.ctx)).toHaveLength(0);
    a.db.close();
    b.db.close();
  });

  it('two devices creating the same day produce one record, and journal conflicts are resolved', async () => {
    const { userId, token } = await register();
    const a = await device(userId, token);
    const b = await device(userId, token);
    await a.engine.sync();
    await b.engine.sync();
    const [dayQ] = await listQuestions(a.ctx);
    const habit = await createHabit(a.ctx, { name: 'Water', measurementType: 'quantity', targetValue: 2, unit: 'l' });
    await a.engine.sync();
    await b.engine.sync();

    // Both offline, both log the same habit and write the same journal question.
    a.net.state.online = false;
    b.net.state.online = false;
    await setHabitValue(a.ctx, habit, '2026-09-29', 1);
    b.ctx.advance(10_000);
    await setHabitValue(b.ctx, habit, '2026-09-29', 1.5);
    await saveAnswer(a.ctx, '2026-09-29', dayQ!, { textValue: 'Morning thoughts (phone)' });
    await saveAnswer(b.ctx, '2026-09-29', dayQ!, { textValue: 'Evening thoughts (tablet)' });

    a.net.state.online = true;
    b.net.state.online = true;
    await a.engine.sync();
    const stateB = await b.engine.sync();

    // Same deterministic ids: one habit log (last write wins), one routine, one answer.
    const auth = { Authorization: `Bearer ${token}` };
    const logs = (await (await fetch(`${baseUrl}/api/habit-logs`, { headers: auth })).json()) as { data: { value: number }[] };
    expect(logs.data).toHaveLength(1);
    expect(logs.data[0]?.value).toBe(1.5);

    // Journal text wasn't silently overwritten.
    expect(stateB.conflicts).toBe(1);
    const [conflict] = await listConflicts(b.db);
    expect(conflict).toMatchObject({ mine: 'Evening thoughts (tablet)', theirs: 'Morning thoughts (phone)' });
    await resolveConflict(b.ctx, conflict!, 'both');
    const after = await b.engine.sync();
    expect(after).toMatchObject({ conflicts: 0, pending: 0, phase: 'idle' });

    await a.engine.sync();
    const text = (await getJournalDay(a.ctx, '2026-09-29')).questions[0]?.answer?.textValue;
    expect(text).toContain('Morning thoughts (phone)');
    expect(text).toContain('Evening thoughts (tablet)');
    a.db.close();
    b.db.close();
  });

  it('retries after a failed sync without creating duplicates', async () => {
    const { userId, token } = await register();
    const phone = await device(userId, token);
    await phone.engine.sync();
    await createUrge(phone.ctx, { localDate: '2026-09-29', localTime: '10:00', intensity: 3 });

    // Simulate the response being lost: the server applied the push, the device never heard back.
    const realPush = phone.net.transport.push;
    phone.net.transport.push = async (req) => {
      await realPush(req);
      throw new Error('Connection reset');
    };
    const failed = await phone.engine.sync();
    expect(failed.phase).toBe('error');
    expect(failed.pending).toBe(1);

    phone.net.transport.push = realPush;
    const ok = await phone.engine.sync();
    expect(ok).toMatchObject({ phase: 'idle', pending: 0 });

    const res = (await (await fetch(`${baseUrl}/api/urges`, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
      data: unknown[];
    };
    expect(res.data).toHaveLength(1);
    phone.db.close();
  });

  it('resets local data when all data was deleted from another device', async () => {
    const { userId, token } = await register();
    const phone = await device(userId, token);
    await phone.engine.sync();
    await createHabit(phone.ctx, { name: 'Old', measurementType: 'boolean' });
    await phone.engine.sync();

    await fetch(`${baseUrl}/api/account/data`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: 'e2e-password-1' }),
    });
    await createHabit(phone.ctx, { name: 'Made before hearing about the reset', measurementType: 'boolean' });
    const state = await phone.engine.sync();
    expect(state.phase).toBe('idle');
    expect(await listHabits(phone.ctx)).toHaveLength(0);
    expect(await listQuestions(phone.ctx)).toHaveLength(4);
    phone.db.close();
  });
});
