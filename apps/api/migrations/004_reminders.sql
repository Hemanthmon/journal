-- Short personal reminders shown on the dashboard every day (e.g. "Phone stays outside
-- the bedroom"). Synced like the other user records.
CREATE TABLE reminders (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  text          VARCHAR(200) NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_reminders_user_seq (user_id, server_seq),
  CONSTRAINT fk_reminders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
