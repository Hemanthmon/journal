import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../db/schema';
import type { Db, SqlValue } from '../db/types';

/**
 * Test implementation of `Db` using Node's built-in SQLite. Transactions are serialised
 * with a promise chain, mirroring expo-sqlite's exclusive transactions.
 */
export async function createTestDb(path = ':memory:'): Promise<Db & { close(): void }> {
  const raw = new DatabaseSync(path);
  let chain: Promise<unknown> = Promise.resolve();

  const base = (inTx: boolean): Db => {
    const db: Db = {
      exec: async (sql) => {
        raw.exec(sql);
      },
      run: async (sql, params: SqlValue[] = []) => {
        raw.prepare(sql).run(...params);
      },
      get: async <T>(sql: string, params: SqlValue[] = []) =>
        (raw.prepare(sql).get(...params) as T | undefined) ?? undefined,
      all: async <T>(sql: string, params: SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
      transaction: <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
        if (inTx) return fn(db);
        const run = chain.then(async () => {
          raw.exec('BEGIN IMMEDIATE');
          try {
            const r = await fn(base(true));
            raw.exec('COMMIT');
            return r;
          } catch (e) {
            raw.exec('ROLLBACK');
            throw e;
          }
        });
        chain = run.catch(() => undefined);
        return run;
      },
    };
    return db;
  };

  const db = base(false);
  await migrate(db);
  return Object.assign(db, { close: () => raw.close() });
}
