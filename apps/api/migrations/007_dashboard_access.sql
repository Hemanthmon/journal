-- Read-only web dashboard access: which viewer (by email) may see whose data.
-- Rows with source = 'env' are managed from DASHBOARD_VIEWER_EMAIL / DASHBOARD_OWNER_EMAIL
-- at server start; 'manual' rows are for explicit grants added later. Revoking sets
-- revoked_at (history is kept).
CREATE TABLE dashboard_access (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_user_id CHAR(36) CHARACTER SET ascii NOT NULL,
  viewer_email  VARCHAR(255) NOT NULL,
  source        ENUM('env', 'manual') NOT NULL,
  granted_at    DATETIME(3) NOT NULL,
  revoked_at    DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_dashboard_access_viewer (viewer_email, revoked_at),
  CONSTRAINT fk_dashboard_access_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One-time login codes. Only a keyed hash of the code is stored.
CREATE TABLE dashboard_login_codes (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  email       VARCHAR(255) NOT NULL,
  code_hash   CHAR(64) CHARACTER SET ascii NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_dashboard_login_codes_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
