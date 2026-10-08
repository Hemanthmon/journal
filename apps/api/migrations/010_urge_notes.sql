-- Notes emailed when the user opens the breathing exercise during an urge. Counting them
-- per user keeps every note different until all have been sent, and limits how many go
-- out per hour.
CREATE TABLE urge_notes (
  id         CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  note_index SMALLINT UNSIGNED NOT NULL,
  sent_at    DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_urge_notes_user_sent (user_id, sent_at),
  CONSTRAINT fk_urge_notes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
