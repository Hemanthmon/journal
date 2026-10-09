-- When people the owner shared the dashboard with sign in and how long they stay. A
-- visit runs from the first request until the last heartbeat; 30 minutes without
-- activity starts a new visit.
CREATE TABLE dashboard_visits (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  grant_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_user_id CHAR(36) CHARACTER SET ascii NOT NULL,
  viewer_email  VARCHAR(255) NOT NULL,
  signed_in     TINYINT(1) NOT NULL DEFAULT 0,
  device        VARCHAR(60) NULL,
  started_at    DATETIME(3) NOT NULL,
  last_seen_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_dashboard_visits_owner (owner_user_id, started_at),
  KEY ix_dashboard_visits_grant (grant_id, last_seen_at),
  CONSTRAINT fk_dashboard_visits_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
