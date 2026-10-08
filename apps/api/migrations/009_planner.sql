-- Planner (Atomic Habits): identities, monthly focuses / weekly goals, daily tasks and
-- weekly / monthly reviews. Synced like the other user records. References between
-- them (identity_id, parent_id, goal_id) are soft: a deleted identity or goal leaves
-- its tasks in place, and the app simply stops showing the link.
CREATE TABLE identities (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  statement     VARCHAR(120) NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_identities_user_seq (user_id, server_seq),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE plan_goals (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  level         ENUM('month', 'week') NOT NULL,
  period_start  DATE NOT NULL,
  text          VARCHAR(200) NOT NULL,
  identity_id   CHAR(36) CHARACTER SET ascii NULL,
  parent_id     CHAR(36) CHARACTER SET ascii NULL,
  done_at       DATETIME(3) NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_plan_goals_user_period (user_id, level, period_start),
  KEY ix_plan_goals_user_seq (user_id, server_seq),
  CONSTRAINT fk_plan_goals_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE plan_tasks (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  title         VARCHAR(200) NOT NULL,
  local_date    DATE NOT NULL,
  identity_id   CHAR(36) CHARACTER SET ascii NULL,
  goal_id       CHAR(36) CHARACTER SET ascii NULL,
  local_time    TIME NULL,
  place         VARCHAR(100) NULL,
  two_minute    VARCHAR(200) NULL,
  completed_at  DATETIME(3) NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_plan_tasks_user_date (user_id, local_date),
  KEY ix_plan_tasks_user_seq (user_id, server_seq),
  CONSTRAINT fk_plan_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE plan_reviews (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  level         ENUM('month', 'week') NOT NULL,
  period_start  DATE NOT NULL,
  went_well     TEXT NULL,
  make_easier   TEXT NULL,
  one_percent   TEXT NULL,
  created_at    DATETIME(3) NOT NULL,
  updated_at    DATETIME(3) NOT NULL,
  deleted_at    DATETIME(3) NULL,
  server_seq    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY ix_plan_reviews_user_period (user_id, level, period_start),
  KEY ix_plan_reviews_user_seq (user_id, server_seq),
  CONSTRAINT fk_plan_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
