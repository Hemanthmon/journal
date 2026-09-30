import * as SQLite from 'expo-sqlite';
import { migrate } from './schema';
import type { Db, SqlValue } from './types';

const DB_NAME = 'journal.db';

type Executor = Pick<SQLite.SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

function wrap(exec: Executor, transaction: Db['transaction']): Db {
  const db: Db = {
    exec: (sql) => exec.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      await exec.runAsync(sql, params);
    },
    get: async <T>(sql: string, params: SqlValue[] = []) => (await exec.getFirstAsync<T>(sql, params)) ?? undefined,
    all: <T>(sql: string, params: SqlValue[] = []) => exec.getAllAsync<T>(sql, params),
    transaction,
  };
  return db;
}

let opened: Promise<Db> | undefined;

/**
 * Opens (once) the on-device database and applies migrations. Exclusive transactions are
 * used so that background sync and UI writes can't interleave inside each other's
 * transactions.
 */
export function openDb(): Promise<Db> {
  opened ??= (async () => {
    const raw = await SQLite.openDatabaseAsync(DB_NAME);
    await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
    const db: Db = wrap(raw, (fn) => {
      let result: Awaited<ReturnType<typeof fn>>;
      return raw
        .withExclusiveTransactionAsync(async (txn) => {
          const tx: Db = wrap(txn, (inner) => inner(tx));
          result = await fn(tx);
        })
        .then(() => result);
    });
    await migrate(db);
    return db;
  })();
  return opened;
}
