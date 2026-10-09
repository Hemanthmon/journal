-- Repeating blocks and tasks. A series describes what repeats; each day's occurrence is
-- an ordinary block or task (with a deterministic id) that points back to its series.
CREATE TABLE repeat_series (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  kind        ENUM('block', 'task') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NULL,
  frequency   ENUM('daily', 'weekly', 'custom') NOT NULL,
  days        TINYINT UNSIGNED NOT NULL,
  start_time  TIME NULL,
  end_time    TIME NULL,
  color       VARCHAR(16) NULL,
  identity_id CHAR(36) CHARACTER SET ascii NULL,
  notes       TEXT NULL,
  place       VARCHAR(100) NULL,
  two_minute  VARCHAR(200) NULL,
  created_at  DATETIME(3) NOT NULL,
  updated_at  DATETIME(3) NOT NULL,
  deleted_at  DATETIME(3) NULL,
  server_seq  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_repeat_series_user_seq (user_id, server_seq),
  CONSTRAINT fk_repeat_series_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE plan_tasks ADD COLUMN series_id CHAR(36) CHARACTER SET ascii NULL AFTER display_order;
ALTER TABLE time_blocks ADD COLUMN series_id CHAR(36) CHARACTER SET ascii NULL AFTER notes;
