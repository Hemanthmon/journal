import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './pool';

/** Runs `fn` in a transaction; commits on success, rolls back if it throws. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // The original error is more useful than a rollback failure.
    }
    throw err;
  } finally {
    conn.release();
  }
}
