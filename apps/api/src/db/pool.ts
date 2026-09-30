import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { config } from '../config/env';

/** Anything that can run a query: the pool, or a connection inside a transaction. */
export type Queryable = Pool | PoolConnection;

let pool: Pool | undefined;

/**
 * All DATETIME columns hold UTC. mysql2's `timezone: 'Z'` makes JS Date <-> DATETIME
 * conversion use UTC. The app always passes timestamps explicitly and never relies on
 * NOW(), so the server's session time zone doesn't matter.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      connectionLimit: 10,
      timezone: 'Z',
      // Calendar dates stay as 'YYYY-MM-DD' strings; they are not instants.
      dateStrings: ['DATE'],
      decimalNumbers: true,
      supportBigNumbers: true,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
