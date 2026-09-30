-- One-time setup. Run as a MySQL admin (e.g. root), after replacing the password:
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < apps/api/scripts/setup-db.sql
-- Then put the same password in apps/api/.env and apps/api/.env.test.

CREATE DATABASE IF NOT EXISTS journal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS journal_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'journal_app'@'localhost' IDENTIFIED BY 'change-me';
CREATE USER IF NOT EXISTS 'journal_app'@'127.0.0.1' IDENTIFIED BY 'change-me';

-- Least privilege: the app user can manage tables in its own databases only.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON journal.* TO 'journal_app'@'localhost', 'journal_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON journal_test.* TO 'journal_app'@'localhost', 'journal_app'@'127.0.0.1';

FLUSH PRIVILEGES;
