import type { Db } from './types';

/**
 * Local SQLite schema. Data tables mirror the server's tables and column names (see
 * ENTITIES in @journal/shared) plus local sync columns:
 *
 *   server_seq      version last seen from the server (NULL = never synced)
 *   sync_status     'synced' | 'pending' | 'conflict' | 'rejected'
 *   last_synced_at  when this row last matched the server
 *
 * Datetimes are ISO-8601 UTC strings, booleans 0/1, schedules a weekday bitmask.
 * Passwords are never stored here; tokens live in SecureStore.
 *
 * Migrations are append-only; PRAGMA user_version records how many have run.
 */
const SYNC_COLUMNS = `
  user_id        TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  server_seq     INTEGER,
  sync_status    TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TEXT`;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE habits (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    measurement_type TEXT NOT NULL,
    target_value REAL NOT NULL,
    unit TEXT,
    schedule_days INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE habit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    target_snapshot REAL NOT NULL,
    unit_snapshot TEXT,
    type_snapshot TEXT NOT NULL,
    ${SYNC_COLUMNS}
  );
  CREATE INDEX ix_habit_logs_date ON habit_logs (local_date);
  CREATE TABLE daily_routines (
    id TEXT PRIMARY KEY NOT NULL,
    local_date TEXT NOT NULL,
    ${SYNC_COLUMNS}
  );
  CREATE INDEX ix_daily_routines_date ON daily_routines (local_date);
  CREATE TABLE journal_questions (
    id TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    is_required INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    system_key TEXT,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE journal_answers (
    id TEXT PRIMARY KEY NOT NULL,
    routine_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_text_snapshot TEXT NOT NULL,
    question_type_snapshot TEXT NOT NULL,
    text_value TEXT,
    emoji_value INTEGER,
    ${SYNC_COLUMNS}
  );
  CREATE INDEX ix_journal_answers_routine ON journal_answers (routine_id);
  CREATE TABLE urge_records (
    id TEXT PRIMARY KEY NOT NULL,
    occurred_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    local_time TEXT NOT NULL,
    trigger_text TEXT,
    intensity INTEGER NOT NULL,
    action_taken TEXT,
    outcome TEXT,
    emotion_before TEXT,
    masturbated INTEGER,
    explicit_content INTEGER,
    remarks TEXT,
    ${SYNC_COLUMNS}
  );
  CREATE INDEX ix_urge_records_date ON urge_records (local_date);

  -- Pending changes, in the order they were made. One row per record: a record edited
  -- several times before syncing is uploaded once, in its first position.
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    change_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (entity, record_id)
  );

  -- Journal edits that collided with an edit from another device.
  CREATE TABLE conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    server_json TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    UNIQUE (entity, record_id)
  );

  -- Sync cursor, data epoch, owner user id.
  CREATE TABLE sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  -- Device-only preferences (theme, reminders, privacy). Never synced.
  CREATE TABLE prefs (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `,
  `
  -- Personal daily reminders shown on the dashboard.
  CREATE TABLE reminders (
    id TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    ${SYNC_COLUMNS}
  );
  `,
  `
  -- The user's emotion chips for the urge form.
  CREATE TABLE emotion_options (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    ${SYNC_COLUMNS}
  );
  `,
];

export async function migrate(db: Db): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[i]!);
      await tx.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

/** Tables holding the user's synced data (not prefs). */
export const DATA_TABLES = [
  'journal_answers',
  'habit_logs',
  'daily_routines',
  'journal_questions',
  'habits',
  'urge_records',
  'reminders',
  'emotion_options',
  'outbox',
  'conflicts',
  'sync_state',
] as const;

/** Removes every piece of the user's data from this device. */
export async function wipeUserData(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of DATA_TABLES) await tx.run(`DELETE FROM ${t}`);
  });
}
