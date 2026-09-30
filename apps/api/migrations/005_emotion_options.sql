-- The user's own list of emotions offered as chips in the urge form. Defaults are created
-- by the app with deterministic ids, so several devices never duplicate them.
CREATE TABLE emotion_options (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  name          VARCHAR(40) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_emotion_options_user_seq (user_id, server_seq),
  CONSTRAINT fk_emotion_options_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
