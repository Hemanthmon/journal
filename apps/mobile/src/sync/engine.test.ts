import { describe, expect, it } from 'vitest';
import type { PullResponse, PushRequest, PushResponse } from '@journal/shared';
import { createTestDb } from '../test/nodeDb';
import { makeCtx, outboxCount } from '../test/ctx';
import { createHabit, updateHabit } from '../data/habits';
import { createQuestion, saveAnswer } from '../data/journal';
import { getLocal, setKv } from '../data/records';
import { createUrge } from '../data/urges';
import { SyncEngine, TransportError, type SyncTransport } from './engine';
import { listConflicts, resolveConflict } from './conflicts';

/** Scriptable in-memory server. */
function fakeServer() {
  let seq = 0;
  const pushes: PushRequest[] = [];
  const server = {
    online: true,
    failNextPush: false,
    onPush: undefined as undefined | ((req: PushRequest) => Promise<void> | void),
    respond: (req: PushRequest): PushResponse => ({
      epoch: 1,
      results: req.changes.map((c) => ({ changeId: c.changeId, status: 'applied' as const, serverSeq: ++seq })),
    }),
    pulls: [] as PullResponse[],
    pushes,
  };
  const transport: SyncTransport = {
    async push(req) {
      if (server.failNextPush) {
        server.failNextPush = false;
        throw new TransportError('network', 'Network request failed');
      }
      pushes.push(req);
      await server.onPush?.(req);
      return server.respond(req);
    },
    async pull(cursor) {
      return server.pulls.shift() ?? { epoch: 1, changes: [], nextCursor: cursor, hasMore: false };
    },
  };
  return { server, transport };
}

async function setup() {
  const db = await createTestDb();
  const ctx = makeCtx(db);
  const { server, transport } = fakeServer();
  const states: string[] = [];
  const engine = new SyncEngine({
    db,
    userId: ctx.userId,
    transport,
    isOnline: () => server.online,
    now: ctx.now,
    onState: (s) => states.push(s.phase),
  });
  return { db, ctx, server, engine, states };
}

describe('sync status', () => {
  it('reports Offline, keeps writes pending, then syncs when back online', async () => {
    const { db, ctx, server, engine } = await setup();
    server.online = false;
    await createHabit(ctx, { name: 'Walk', measurementType: 'boolean' });
    await createUrge(ctx, { localDate: '2026-09-29', localTime: '21:00', intensity: 4 });

    let state = await engine.sync();
    expect(state).toMatchObject({ phase: 'offline', pending: 2 });

    server.online = true;
    state = await engine.sync();
    expect(state).toMatchObject({ phase: 'idle', pending: 0, lastError: null });
    expect(state.lastSyncedAt).toEqual(expect.any(String));
    expect(await outboxCount(db)).toBe(0);
  });

  it('shows Syncing while working and a failure state on errors, keeping changes queued', async () => {
    const { db, ctx, server, engine, states } = await setup();
    await createHabit(ctx, { name: 'Read', measurementType: 'count', targetValue: 10 });
    server.failNextPush = true;
    const state = await engine.sync();
    expect(states).toContain('syncing');
    expect(state.phase).toBe('offline'); // network failure mid-sync
    expect(state.errorKind).toBe('network');
    const row = await db.get<{ attempts: number }>('SELECT attempts FROM outbox');
    expect(row?.attempts).toBe(1);

    // Retry succeeds and the change is uploaded exactly once more (same change id).
    const retry = await engine.sync();
    expect(retry.phase).toBe('idle');
    expect(server.pushes).toHaveLength(1);
  });

  it('reports a server error as "error" (Sync failed)', async () => {
    const { ctx, server, engine } = await setup();
    await createHabit(ctx, { name: 'X', measurementType: 'boolean' });
    server.respond = () => {
      throw new TransportError('server', 'HTTP 500');
    };
    const state = await engine.sync();
    expect(state).toMatchObject({ phase: 'error', lastError: 'HTTP 500', pending: 1 });
  });

  it('never blocks writing while a sync is in progress, and keeps edits made mid-upload', async () => {
    const { db, ctx, server, engine } = await setup();
    const habit = await createHabit(ctx, { name: 'Before', measurementType: 'boolean' });
    server.onPush = async () => {
      ctx.advance(1000);
      await updateHabit(ctx, habit.id, { name: 'Edited during sync' });
    };
    await engine.sync();
    const row = await getLocal(db, 'habits', habit.id);
    expect(row?.record.name).toBe('Edited during sync');
    // The mid-sync edit is uploaded by the follow-up pass the engine runs automatically,
    // or on the next sync.
    server.onPush = undefined;
    await engine.sync();
    expect(server.pushes.at(-1)?.changes[0]?.record.name).toBe('Edited during sync');
    expect(await outboxCount(db)).toBe(0);
  });

  it('marks rejected records and stops retrying them', async () => {
    const { db, ctx, server, engine } = await setup();
    const h = await createHabit(ctx, { name: 'Bad', measurementType: 'boolean' });
    server.respond = (req) => ({
      epoch: 1,
      results: req.changes.map((c) => ({ changeId: c.changeId, status: 'rejected' as const, errorCode: 'INVALID' as const })),
    });
    const state = await engine.sync();
    expect(state).toMatchObject({ phase: 'idle', rejected: 1, pending: 0 });
    expect((await getLocal(db, 'habits', h.id))?.syncStatus).toBe('rejected');
  });
});

describe('app newer than server', () => {
  it('keeps record types the server does not know yet queued, instead of dropping them', async () => {
    const { db, ctx, server, engine } = await setup();
    const { createReminder } = await import('../data/reminders');
    const r = await createReminder(ctx, 'Drink water');
    server.respond = (req) => ({
      epoch: 1,
      results: req.changes.map((c) => ({ changeId: c.changeId, status: 'rejected' as const, errorCode: 'UNKNOWN_ENTITY' as const })),
    });
    const state = await engine.sync();
    expect(state).toMatchObject({ pending: 1, rejected: 0 });
    expect((await getLocal(db, 'reminders', r.id))?.syncStatus).toBe('pending');

    // Server updated: the queued reminder uploads.
    server.respond = (req) => ({
      epoch: 1,
      results: req.changes.map((c) => ({ changeId: c.changeId, status: 'applied' as const, serverSeq: 99 })),
    });
    const after = await engine.sync();
    expect(after).toMatchObject({ pending: 0, rejected: 0 });
    expect((await getLocal(db, 'reminders', r.id))?.syncStatus).toBe('synced');
  });
});

describe('journal conflicts', () => {
  it('keeps both versions and lets the user resolve', async () => {
    const { db, ctx, server, engine } = await setup();
    const q = await createQuestion(ctx, { text: 'How was your day?', type: 'text' });
    await engine.sync();
    const answer = await saveAnswer(ctx, '2026-09-29', q, { textValue: 'Written on this phone' });

    server.respond = (req) => ({
      epoch: 1,
      results: req.changes.map((c) =>
        c.entity === 'journalAnswers'
          ? {
              changeId: c.changeId,
              status: 'conflict' as const,
              serverSeq: 50,
              record: { ...(c.record as Record<string, unknown>), textValue: 'Written on the tablet', serverSeq: 50 } as never,
            }
          : { changeId: c.changeId, status: 'applied' as const, serverSeq: 40 },
      ),
    });
    const state = await engine.sync();
    expect(state.conflicts).toBe(1);

    // The local text was not overwritten.
    expect((await getLocal(db, 'journalAnswers', answer.id))?.record.textValue).toBe('Written on this phone');
    const [conflict] = await listConflicts(db);
    expect(conflict).toMatchObject({ mine: 'Written on this phone', theirs: 'Written on the tablet', localDate: '2026-09-29' });

    await resolveConflict(ctx, conflict!, 'both');
    const merged = await getLocal(db, 'journalAnswers', answer.id);
    expect(merged?.record.textValue).toContain('Written on this phone');
    expect(merged?.record.textValue).toContain('Written on the tablet');
    expect(merged?.serverSeq).toBe(50); // re-based on the server version
    expect(await listConflicts(db)).toHaveLength(0);
  });

  it('does not let a pull overwrite unsent local edits', async () => {
    const { db, ctx, server, engine } = await setup();
    server.online = false;
    const h = await createHabit(ctx, { name: 'Local edit', measurementType: 'boolean' });
    await setKv(db, 'epoch', '1');
    server.online = true;
    server.pulls.push({
      epoch: 1,
      changes: [{ entity: 'habits', record: { ...h, name: 'Server copy', serverSeq: 9 } as never }],
      nextCursor: 9,
      hasMore: false,
    });
    server.respond = (req) => ({
      epoch: 1,
      results: req.changes.map((c) => ({ changeId: c.changeId, status: 'applied' as const, serverSeq: 10 })),
    });
    // Push runs before pull, so here the local edit is uploaded first; simulate the reverse
    // order by pulling directly while the edit is still pending.
    await (engine as unknown as { pullAll(): Promise<void> }).pullAll();
    expect((await getLocal(db, 'habits', h.id))?.record.name).toBe('Local edit');
  });
});
