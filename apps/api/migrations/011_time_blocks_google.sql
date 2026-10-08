-- Calendar time blocks (synced like other records), plus server-only Google Calendar
-- state: the connected account and which Google event each block is linked to.
CREATE TABLE time_blocks (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  title         VARCHAR(200) NOT NULL,
  local_date    DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  color         VARCHAR(16) NOT NULL,
  identity_id   CHAR(36) CHARACTER SET ascii NULL,
  notes         TEXT NULL,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_time_blocks_user_date (user_id, local_date),
  KEY ix_time_blocks_user_seq (user_id, server_seq),
  CONSTRAINT fk_time_blocks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ck_time_blocks_times CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One connected Google account per user. The refresh token is encrypted (AES-256-GCM).
CREATE TABLE google_accounts (
  user_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  google_email   VARCHAR(255) NULL,
  refresh_token  VARBINARY(2048) NOT NULL,
  calendar_id    VARCHAR(255) NOT NULL DEFAULT 'primary',
  last_pulled_at DATETIME(3) NULL,
  last_sync_at   DATETIME(3) NULL,
  last_error     VARCHAR(255) NULL,
  connected_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_google_accounts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Block ↔ Google event. pushed_seq is the block version Google already has, so only
-- newer versions are sent; google_updated lets an import skip our own echoes.
CREATE TABLE google_event_links (
  block_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  event_id       VARCHAR(1024) CHARACTER SET ascii NOT NULL,
  pushed_seq     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  google_updated VARCHAR(40) NULL,
  PRIMARY KEY (block_id),
  KEY ix_google_event_links_event (user_id, event_id(191)),
  CONSTRAINT fk_google_event_links_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
