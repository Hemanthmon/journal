export type SqlValue = string | number | null;

/**
 * Minimal database interface used by repositories and the sync engine.
 *
 * The app implements it with expo-sqlite; tests implement it with Node's built-in
 * SQLite, so the same SQL and logic are tested without a device.
 */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Runs `fn` atomically. Only queries made through the `tx` handle belong to the
   * transaction. Nested calls on `tx` run inline in the same transaction.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
