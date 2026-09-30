import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../src/db/pool';

/**
 * Database-level guarantees: constraints, foreign keys, and preservation of history.
 * These insert directly with SQL to prove the database enforces the rules even if
 * application code has a bug.
 */

const now = new Date();
let seq = 1000;

async function insertUser(): Promise<string> {
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, 'x', 'U', ?, ?)`,
    [id, `${id}@example.com`, now, now],
  );
  return id;
}

async function insertHabit(userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const h = {
    id: randomUUID(),
    measurement_type: 'duration',
    target_value: 30,
    schedule_days: 127,
    ...overrides,
  };
  await getPool().execute(
    `INSERT INTO habits (id, user_id, name, measurement_type, target_value, schedule_days, created_at, updated_at, server_seq)
     VALUES (?, ?, 'Exercise', ?, ?, ?, ?, ?, ?)`,
    [h.id, userId, h.measurement_type, h.target_value, h.schedule_days, now, now, seq++],
  );
  return h.id as string;
}

async function insertLog(userId: string, habitId: string, overrides: Record<string, unknown> = {}) {
  const l = { id: randomUUID(), local_date: '2026-09-29', value: 15, target_snapshot: 30, type_snapshot: 'duration', ...overrides };
  await getPool().execute(
    `INSERT INTO habit_logs (id, user_id, habit_id, local_date, value, target_snapshot, type_snapshot, created_at, updated_at, server_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [l.id, userId, habitId, l.local_date, l.value, l.target_snapshot, l.type_snapshot, now, now, seq++],
  );
  return l.id as string;
}

async function insertRoutine(userId: string, localDate = '2026-09-29'): Promise<string> {
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO daily_routines (id, user_id, local_date, created_at, updated_at, server_seq) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, localDate, now, now, seq++],
  );
  return id;
}

async function insertQuestion(userId: string, type: 'text' | 'emoji' = 'text'): Promise<string> {
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO journal_questions (id, user_id, text, type, created_at, updated_at, server_seq) VALUES (?, ?, 'Q?', ?, ?, ?, ?)`,
    [id, userId, type, now, now, seq++],
  );
  return id;
}

async function insertAnswer(
  userId: string,
  routineId: string,
  questionId: string,
  a: { type: 'text' | 'emoji'; text?: string | null; emoji?: number | null },
) {
  await getPool().execute(
    `INSERT INTO journal_answers
       (id, user_id, routine_id, question_id, question_text_snapshot, question_type_snapshot, text_value, emoji_value, created_at, updated_at, server_seq)
     VALUES (?, ?, ?, ?, 'Q?', ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, routineId, questionId, a.type, a.text ?? null, a.emoji ?? null, now, now, seq++],
  );
}

async function insertUrge(userId: string, intensity: number, localDate = '2026-09-28') {
  const id = randomUUID();
  await getPool().execute(
    `INSERT INTO urge_records (id, user_id, occurred_at, local_date, local_time, intensity, created_at, updated_at, server_seq)
     VALUES (?, ?, ?, ?, '21:30:00', ?, ?, ?, ?)`,
    [id, userId, now, localDate, intensity, now, now, seq++],
  );
  return id;
}

let userA: string;
let userB: string;

beforeAll(async () => {
  userA = await insertUser();
  userB = await insertUser();
});

describe('users', () => {
  it('rejects duplicate emails case-insensitively', async () => {
    const id = randomUUID();
    await getPool().execute(
      `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, 'x', 'U', ?, ?)`,
      [id, `Case-${id}@Example.com`, now, now],
    );
    await expect(
      getPool().execute(
        `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, 'x', 'U', ?, ?)`,
        [randomUUID(), `case-${id}@example.com`, now, now],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});

describe('habits constraints', () => {
  it('rejects an empty schedule and out-of-range bitmasks', async () => {
    await expect(insertHabit(userA, { schedule_days: 0 })).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await expect(insertHabit(userA, { schedule_days: 128 })).rejects.toThrow();
  });

  it('rejects a non-positive target', async () => {
    await expect(insertHabit(userA, { target_value: 0 })).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  it('requires boolean habits to have target 1', async () => {
    await expect(insertHabit(userA, { measurement_type: 'boolean', target_value: 2 })).rejects.toMatchObject({
      code: 'ER_CHECK_CONSTRAINT_VIOLATED',
    });
    await expect(insertHabit(userA, { measurement_type: 'boolean', target_value: 1 })).resolves.toBeTypeOf('string');
  });

  it('rejects an unknown measurement type', async () => {
    await expect(insertHabit(userA, { measurement_type: 'distance' })).rejects.toThrow();
  });
});

describe('habit_logs constraints', () => {
  it('allows one log per habit per day', async () => {
    const habit = await insertHabit(userA);
    await insertLog(userA, habit, { local_date: '2026-09-01' });
    await expect(insertLog(userA, habit, { local_date: '2026-09-01' })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it("cannot reference another user's habit", async () => {
    const habitOfB = await insertHabit(userB);
    await expect(insertLog(userA, habitOfB)).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('rejects negative values and non-0/1 boolean values', async () => {
    const habit = await insertHabit(userA);
    await expect(insertLog(userA, habit, { local_date: '2026-09-02', value: -1 })).rejects.toMatchObject({
      code: 'ER_CHECK_CONSTRAINT_VIOLATED',
    });
    const boolHabit = await insertHabit(userA, { measurement_type: 'boolean', target_value: 1 });
    await expect(
      insertLog(userA, boolHabit, { value: 0.5, target_snapshot: 1, type_snapshot: 'boolean' }),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  it('keeps values above target (partial and over-achievement are both preserved)', async () => {
    const habit = await insertHabit(userA);
    const id = await insertLog(userA, habit, { local_date: '2026-09-03', value: 45 });
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT value FROM habit_logs WHERE id = ?', [id]);
    expect(rows[0]?.value).toBe(45);
  });
});

describe('historical record preservation', () => {
  it('editing a habit target does not change logged snapshots', async () => {
    const habit = await insertHabit(userA, { target_value: 30 });
    const logId = await insertLog(userA, habit, { local_date: '2026-09-10', value: 15, target_snapshot: 30 });
    await getPool().execute('UPDATE habits SET target_value = 60 WHERE id = ?', [habit]);
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT value, target_snapshot FROM habit_logs WHERE id = ?',
      [logId],
    );
    expect(rows[0]).toMatchObject({ value: 15, target_snapshot: 30 });
  });

  it('a habit with logs cannot be hard-deleted (it must be archived or soft-deleted)', async () => {
    const habit = await insertHabit(userA);
    await insertLog(userA, habit, { local_date: '2026-09-11' });
    await expect(getPool().execute('DELETE FROM habits WHERE id = ?', [habit])).rejects.toMatchObject({
      code: 'ER_ROW_IS_REFERENCED_2',
    });
    await getPool().execute('UPDATE habits SET deleted_at = ? WHERE id = ?', [now, habit]);
    const [logs] = await getPool().execute<RowDataPacket[]>('SELECT id FROM habit_logs WHERE habit_id = ?', [habit]);
    expect(logs).toHaveLength(1);
  });

  it('a question with answers cannot be hard-deleted, and answers keep their snapshot', async () => {
    const question = await insertQuestion(userA);
    const routine = await insertRoutine(userA, '2026-09-12');
    await insertAnswer(userA, routine, question, { type: 'text', text: 'A good day' });
    await expect(getPool().execute('DELETE FROM journal_questions WHERE id = ?', [question])).rejects.toMatchObject({
      code: 'ER_ROW_IS_REFERENCED_2',
    });
    await getPool().execute("UPDATE journal_questions SET text = 'Changed?' WHERE id = ?", [question]);
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT question_text_snapshot FROM journal_answers WHERE question_id = ?',
      [question],
    );
    expect(rows[0]?.question_text_snapshot).toBe('Q?');
  });
});

describe('daily routines and journal answers', () => {
  it('allows one routine per user per day', async () => {
    await insertRoutine(userA, '2026-08-01');
    await expect(insertRoutine(userA, '2026-08-01')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await expect(insertRoutine(userB, '2026-08-01')).resolves.toBeTypeOf('string');
  });

  it('allows one answer per question per routine', async () => {
    const question = await insertQuestion(userA);
    const routine = await insertRoutine(userA, '2026-08-02');
    await insertAnswer(userA, routine, question, { type: 'text', text: 'first' });
    await expect(insertAnswer(userA, routine, question, { type: 'text', text: 'second' })).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
  });

  it("cannot attach an answer to another user's routine or question", async () => {
    const qA = await insertQuestion(userA);
    const rB = await insertRoutine(userB, '2026-08-03');
    await expect(insertAnswer(userA, rB, qA, { type: 'text', text: 'x' })).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });

  it('enforces emoji range and value/type consistency', async () => {
    const q = await insertQuestion(userA, 'emoji');
    const r = await insertRoutine(userA, '2026-08-04');
    await expect(insertAnswer(userA, r, q, { type: 'emoji', emoji: 6 })).rejects.toMatchObject({
      code: 'ER_CHECK_CONSTRAINT_VIOLATED',
    });
    await expect(insertAnswer(userA, r, q, { type: 'emoji', emoji: 3, text: 'also text' })).rejects.toMatchObject({
      code: 'ER_CHECK_CONSTRAINT_VIOLATED',
    });
    await expect(insertAnswer(userA, r, q, { type: 'emoji', emoji: 5 })).resolves.toBeUndefined();
  });

  it('stores long journal text without truncation', async () => {
    const q = await insertQuestion(userA);
    const r = await insertRoutine(userA, '2026-08-05');
    const long = 'Today was long. '.repeat(20_000); // ~320 KB
    await insertAnswer(userA, r, q, { type: 'text', text: long });
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT CHAR_LENGTH(text_value) AS n FROM journal_answers WHERE routine_id = ?',
      [r],
    );
    expect(rows[0]?.n).toBe(long.length);
  });
});

describe('urge_records', () => {
  it('enforces intensity 0..10', async () => {
    await expect(insertUrge(userA, 0)).resolves.toBeTypeOf('string');
    await expect(insertUrge(userA, 10)).resolves.toBeTypeOf('string');
    await expect(insertUrge(userA, 11)).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });

  it('derives weekday from local_date (0 = Monday)', async () => {
    const id = await insertUrge(userA, 5, '2026-09-28'); // a Monday
    const [rows] = await getPool().execute<RowDataPacket[]>('SELECT weekday FROM urge_records WHERE id = ?', [id]);
    expect(rows[0]?.weekday).toBe(0);
  });
});
