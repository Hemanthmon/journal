-- Template for the reflection questions every new user starts with.
-- Copied into journal_questions at registration; users can then edit, disable or delete them.

CREATE TABLE default_journal_questions (
  id            INT NOT NULL,
  text          VARCHAR(500) NOT NULL,
  type          ENUM('text', 'emoji') NOT NULL,
  is_required   TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL,
  system_key    VARCHAR(32) CHARACTER SET ascii NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO default_journal_questions (id, text, type, is_required, display_order, system_key) VALUES
  (1, 'How was your day? Tell us about it.',             'text',  0, 1, 'day'),
  (2, 'How are you feeling today?',                      'emoji', 0, 2, 'mood'),
  (3, 'What''s one thing you could do better tomorrow?', 'text',  0, 3, 'tomorrow'),
  (4, 'What are you grateful for today?',                'text',  0, 4, 'gratitude');
