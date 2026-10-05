import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { PublicUser } from '@journal/shared';
import type { Queryable } from '../../db/pool';
import { allocateSeq } from '../../db/seq';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | undefined> {
  const [rows] = await db.execute<(UserRow & RowDataPacket)[]>(
    'SELECT id, email, password_hash, name, timezone, created_at, updated_at FROM users WHERE email = ?',
    [email],
  );
  return rows[0];
}

export async function findUserById(db: Queryable, id: string): Promise<UserRow | undefined> {
  const [rows] = await db.execute<(UserRow & RowDataPacket)[]>(
    'SELECT id, email, password_hash, name, timezone, created_at, updated_at FROM users WHERE id = ?',
    [id],
  );
  return rows[0];
}

export async function insertUser(
  conn: PoolConnection,
  user: { id: string; email: string; passwordHash: string; name: string; timezone: string; now: Date },
): Promise<void> {
  await conn.execute(
    `INSERT INTO users (id, email, password_hash, name, timezone, sync_seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [user.id, user.email, user.passwordHash, user.name, user.timezone, user.now, user.now],
  );
}

/** Copies the default reflection questions into a new user's account. */
export async function seedDefaultQuestions(conn: PoolConnection, userId: string, now: Date): Promise<void> {
  const [templates] = await conn.query<RowDataPacket[]>(
    'SELECT text, type, is_required, display_order, system_key FROM default_journal_questions ORDER BY display_order',
  );
  if (templates.length === 0) return;
  let seq = await allocateSeq(conn, userId, templates.length);
  const values = templates.map((t) => [
    randomUUID(),
    userId,
    t.text,
    t.type,
    t.is_required,
    1,
    t.display_order,
    t.system_key,
    now,
    now,
    seq++,
  ]);
  await conn.query(
    `INSERT INTO journal_questions
       (id, user_id, text, type, is_required, is_active, display_order, system_key, created_at, updated_at, server_seq)
     VALUES ?`,
    [values],
  );
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
}

export async function insertRefreshToken(
  db: Queryable,
  t: { userId: string; familyId: string; tokenHash: string; expiresAt: Date; now: Date },
): Promise<string> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, t.userId, t.familyId, t.tokenHash, t.expiresAt, t.now],
  );
  return id;
}

export async function findRefreshTokenForUpdate(
  conn: PoolConnection,
  tokenHash: string,
): Promise<RefreshTokenRow | undefined> {
  const [rows] = await conn.execute<(RefreshTokenRow & RowDataPacket)[]>(
    `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
       FROM refresh_tokens WHERE token_hash = ? FOR UPDATE`,
    [tokenHash],
  );
  return rows[0];
}

export async function findRefreshTokenByIdForUpdate(
  conn: PoolConnection,
  id: string,
): Promise<RefreshTokenRow | undefined> {
  const [rows] = await conn.execute<(RefreshTokenRow & RowDataPacket)[]>(
    `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
       FROM refresh_tokens WHERE id = ? FOR UPDATE`,
    [id],
  );
  return rows[0];
}

export async function markRefreshTokenRotated(
  conn: PoolConnection,
  id: string,
  replacedBy: string,
  now: Date,
): Promise<void> {
  await conn.execute('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?', [now, replacedBy, id]);
}

export async function revokeFamily(db: Queryable, familyId: string, now: Date): Promise<void> {
  await db.execute('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL', [
    now,
    familyId,
  ]);
}

export async function deleteExpiredRefreshTokens(db: Queryable, userId: string, now: Date): Promise<void> {
  await db.execute('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < ?', [userId, now]);
}
