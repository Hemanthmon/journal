-- Highlights on the owner's diary pages, made by the owner or by people they shared with:
-- a passage of a journal answer (quote + character offsets) or a whole urge, with an
-- optional note. They annotate the journal; they never change it.
CREATE TABLE dashboard_highlights (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_user_id CHAR(36) CHARACTER SET ascii NOT NULL,
  grant_id      CHAR(36) CHARACTER SET ascii NULL,
  author_email  VARCHAR(255) NOT NULL,
  author_name   VARCHAR(100) NULL,
  kind          ENUM('answer', 'urge') NOT NULL,
  local_date    DATE NOT NULL,
  -- answer: the question id; urge: the urge id
  target_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  quote         VARCHAR(2000) NULL,
  start_offset  INT NULL,
  end_offset    INT NULL,
  note          VARCHAR(500) NULL,
  created_at    DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_dashboard_highlights_owner_date (owner_user_id, local_date),
  CONSTRAINT fk_dashboard_highlights_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
