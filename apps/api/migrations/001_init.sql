-- Initial schema.
--
-- Conventions
--   * IDs are client-generated UUIDs (CHAR(36), ascii) so records can be created offline.
--   * All DATETIME(3) columns are UTC. The user's local calendar day is stored separately
--     as a DATE (local_date) for daily entries.
--   * Synced tables carry created_at / updated_at (client clock, used for last-write-wins),
--     deleted_at (soft-delete tombstone) and server_seq (per-user monotonically increasing
--     change sequence assigned by the server; the incremental-pull cursor).
--   * Child rows reference parents with composite (user_id, parent_id) foreign keys, so the
--     database itself guarantees a row can never point at another user's record.
--   * Definitions (habits, questions) are only ever soft-deleted by the app. Foreign keys from
--     historical rows use RESTRICT so a hard delete can't silently destroy history.

CREATE TABLE users (
  id            CHAR(36)     CHARACTER SET ascii NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(100) CHARACTER SET ascii NOT NULL,
  name          VARCHAR(100) NOT NULL,
  timezone      VARCHAR(64)  CHARACTER SET ascii NOT NULL DEFAULT 'UTC',
  sync_seq      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_tokens (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  -- All tokens issued from one login share a family; reuse of a rotated token revokes the family.
  family_id   CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash  CHAR(64) CHARACTER SET ascii NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  revoked_at  DATETIME(3) NULL,
  replaced_by CHAR(36) CHARACTER SET ascii NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY ix_refresh_tokens_family (family_id),
  KEY ix_refresh_tokens_user (user_id),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE habits (
  id               CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  name             VARCHAR(100)  NOT NULL,
  description      VARCHAR(500)  NULL,
  measurement_type ENUM('boolean', 'count', 'duration', 'quantity') NOT NULL,
  target_value     DECIMAL(10, 2) NOT NULL,
  unit             VARCHAR(32)   NULL,
  -- Bitmask: Monday = 1, Tuesday = 2, ... Sunday = 64. 127 = every day.
  schedule_days    TINYINT UNSIGNED NOT NULL DEFAULT 127,
  is_active        TINYINT(1)    NOT NULL DEFAULT 1,
  archived_at      DATETIME(3)   NULL,
  display_order    INT           NOT NULL DEFAULT 0,
  created_at       DATETIME(3)   NOT NULL,
  updated_at       DATETIME(3)   NOT NULL,
  deleted_at       DATETIME(3)   NULL,
  server_seq       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_habits_user_id (user_id, id),
  KEY ix_habits_user_seq (user_id, server_seq),
  CONSTRAINT fk_habits_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_habits_target_positive CHECK (target_value > 0),
  CONSTRAINT ck_habits_boolean_target CHECK (measurement_type <> 'boolean' OR target_value = 1),
  CONSTRAINT ck_habits_schedule CHECK (schedule_days BETWEEN 1 AND 127)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE habit_logs (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  habit_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  local_date      DATE NOT NULL,
  -- Actual recorded value (may exceed target). Boolean habits store 0 or 1.
  value           DECIMAL(10, 2) NOT NULL DEFAULT 0,
  -- Snapshot of the habit definition on this day, so later edits don't rewrite history.
  target_snapshot DECIMAL(10, 2) NOT NULL,
  unit_snapshot   VARCHAR(32) NULL,
  type_snapshot   ENUM('boolean', 'count', 'duration', 'quantity') NOT NULL,
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  deleted_at      DATETIME(3) NULL,
  server_seq      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_habit_logs_day (user_id, habit_id, local_date),
  KEY ix_habit_logs_user_date (user_id, local_date),
  KEY ix_habit_logs_user_seq (user_id, server_seq),
  CONSTRAINT fk_habit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_habit_logs_habit FOREIGN KEY (user_id, habit_id) REFERENCES habits (user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_habit_logs_value CHECK (value >= 0),
  CONSTRAINT ck_habit_logs_target CHECK (target_snapshot > 0),
  CONSTRAINT ck_habit_logs_boolean CHECK (type_snapshot <> 'boolean' OR value IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE daily_routines (
  id         CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  local_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  server_seq BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_routines_day (user_id, local_date),
  UNIQUE KEY uq_daily_routines_user_id (user_id, id),
  KEY ix_daily_routines_user_seq (user_id, server_seq),
  CONSTRAINT fk_daily_routines_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE journal_questions (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  text          VARCHAR(500) NOT NULL,
  type          ENUM('text', 'emoji') NOT NULL,
  is_required   TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  archived_at   DATETIME(3) NULL,
  display_order INT NOT NULL DEFAULT 0,
  -- Marks built-in questions the app gives special meaning to (e.g. 'mood' for the dashboard).
  system_key    VARCHAR(32) CHARACTER SET ascii NULL,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journal_questions_user_id (user_id, id),
  UNIQUE KEY uq_journal_questions_system_key (user_id, system_key),
  KEY ix_journal_questions_user_seq (user_id, server_seq),
  CONSTRAINT fk_journal_questions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE journal_answers (
  id                     CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id                CHAR(36) CHARACTER SET ascii NOT NULL,
  routine_id             CHAR(36) CHARACTER SET ascii NOT NULL,
  question_id            CHAR(36) CHARACTER SET ascii NOT NULL,
  -- Snapshot of the question when answered, so history stays readable after edits/deletes.
  question_text_snapshot VARCHAR(500) NOT NULL,
  question_type_snapshot ENUM('text', 'emoji') NOT NULL,
  text_value             MEDIUMTEXT NULL,
  -- 1 = very sad ... 5 = great
  emoji_value            TINYINT UNSIGNED NULL,
  created_at             DATETIME(3) NOT NULL,
  updated_at             DATETIME(3) NOT NULL,
  deleted_at             DATETIME(3) NULL,
  server_seq             BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journal_answers_routine_question (routine_id, question_id),
  KEY ix_journal_answers_user_seq (user_id, server_seq),
  KEY ix_journal_answers_question (user_id, question_id),
  CONSTRAINT fk_journal_answers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_answers_routine FOREIGN KEY (user_id, routine_id) REFERENCES daily_routines (user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_journal_answers_question FOREIGN KEY (user_id, question_id) REFERENCES journal_questions (user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_journal_answers_emoji_range CHECK (emoji_value IS NULL OR emoji_value BETWEEN 1 AND 5),
  CONSTRAINT ck_journal_answers_type_match CHECK (
    (question_type_snapshot = 'text' AND emoji_value IS NULL) OR
    (question_type_snapshot = 'emoji' AND text_value IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE urge_records (
  id               CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  occurred_at      DATETIME(3) NOT NULL,
  local_date       DATE NOT NULL,
  local_time       TIME NOT NULL,
  -- 0 = Monday ... 6 = Sunday, derived from local_date.
  weekday          TINYINT UNSIGNED GENERATED ALWAYS AS (WEEKDAY(local_date)) STORED,
  trigger_text     VARCHAR(1000) NULL,
  intensity        TINYINT UNSIGNED NOT NULL,
  action_taken     TEXT NULL,
  outcome          TEXT NULL,
  emotion_before   VARCHAR(255) NULL,
  -- NULL = not answered
  masturbated      TINYINT(1) NULL,
  explicit_content TINYINT(1) NULL,
  remarks          TEXT NULL,
  created_at       DATETIME(3) NOT NULL,
  updated_at       DATETIME(3) NOT NULL,
  deleted_at       DATETIME(3) NULL,
  server_seq       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_urge_records_user_date (user_id, local_date),
  KEY ix_urge_records_user_seq (user_id, server_seq),
  CONSTRAINT fk_urge_records_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_urge_records_intensity CHECK (intensity BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Idempotency log for sync pushes: a retried change with the same change_id returns the
-- stored result instead of being applied twice.
CREATE TABLE processed_changes (
  user_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  change_id  CHAR(36) CHARACTER SET ascii NOT NULL,
  result     JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, change_id),
  KEY ix_processed_changes_created (created_at),
  CONSTRAINT fk_processed_changes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
