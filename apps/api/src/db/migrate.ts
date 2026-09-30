import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { config } from '../config/env';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const LOCK_NAME = 'journal_schema_migrations';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies numbered .sql files in order, once each, recording them in schema_migrations.
 * A named lock stops two processes migrating at once. A checksum guards against
 * editing a migration after it has been applied — add a new file instead.
 *
 * MySQL DDL auto-commits, so a failing migration can leave partial changes; keep
 * each file small and focused.
 */
export async function migrate(log: (msg: string) => void = () => {}): Promise<MigrationResult> {
  // A dedicated connection: multipleStatements is needed for .sql files but is never
  // enabled on the application pool.
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, timezone: 'Z' });
  try {
    const [lockRows] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS got', [LOCK_NAME]);
    if (lockRows[0]?.got !== 1) throw new Error('Could not acquire migration lock');

    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version    VARCHAR(255) NOT NULL,
          checksum   CHAR(64) CHARACTER SET ascii NOT NULL,
          applied_at DATETIME(3) NOT NULL,
          PRIMARY KEY (version)
        ) ENGINE=InnoDB`);

      const [appliedRows] = await conn.query<RowDataPacket[]>('SELECT version, checksum FROM schema_migrations');
      const applied = new Map(appliedRows.map((r) => [r.version as string, r.checksum as string]));

      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
      const result: MigrationResult = { applied: [], skipped: [] };

      for (const file of files) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const previous = applied.get(file);
        if (previous !== undefined) {
          if (previous !== checksum) {
            throw new Error(`Migration ${file} was modified after being applied. Create a new migration instead.`);
          }
          result.skipped.push(file);
          continue;
        }
        log(`Applying ${file}`);
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)', [
          file,
          checksum,
          new Date(),
        ]);
        result.applied.push(file);
      }
      return result;
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    await conn.end();
  }
}
