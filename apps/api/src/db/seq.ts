import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/**
 * Reserves `count` consecutive sync sequence numbers for a user and returns the first.
 *
 * Every write to a synced row stamps it with a fresh sequence number; clients pull
 * "everything with server_seq > cursor". The UPDATE row-locks the user until the
 * surrounding transaction ends, so concurrent writers for one user are serialized and
 * numbers are never reused. Must be called inside a transaction.
 */
export async function allocateSeq(conn: PoolConnection, userId: string, count = 1): Promise<number> {
  await conn.execute('UPDATE users SET sync_seq = sync_seq + ? WHERE id = ?', [count, userId]);
  const [rows] = await conn.execute<RowDataPacket[]>('SELECT sync_seq FROM users WHERE id = ?', [userId]);
  const row = rows[0];
  if (!row) throw new Error('allocateSeq: user does not exist');
  return Number(row.sync_seq) - count + 1;
}
