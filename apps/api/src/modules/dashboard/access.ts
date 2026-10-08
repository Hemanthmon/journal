import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../../config/env';
import type { Queryable } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { logger } from '../../lib/logger';

/**
 * Who may view whose data on the read-only dashboard. Access is a row in
 * `dashboard_access`; revoking sets `revoked_at`. For now the grant is managed from
 * DASHBOARD_VIEWER_EMAIL / DASHBOARD_OWNER_EMAIL (source 'env'); changing those variables
 * revokes the old env grant and creates the new one at the next server start. Without
 * DASHBOARD_OWNER_EMAIL the owner is the only account; once there are several, access is
 * revoked until the variable names one, so the viewer never sees the wrong person's data.
 */

export interface AccessGrant {
  id: string;
  ownerUserId: string;
  viewerEmail: string;
}

type Row = RowDataPacket & Record<string, unknown>;

export async function findActiveGrant(db: Queryable, viewerEmail: string): Promise<AccessGrant | undefined> {
  const [rows] = await db.execute<Row[]>(
    `SELECT a.id, a.owner_user_id, a.viewer_email FROM dashboard_access a
      WHERE a.viewer_email = ? AND a.revoked_at IS NULL
      ORDER BY a.granted_at DESC LIMIT 1`,
    [viewerEmail],
  );
  const r = rows[0];
  return r ? { id: String(r.id), ownerUserId: String(r.owner_user_id), viewerEmail: String(r.viewer_email) } : undefined;
}

export async function findGrantById(db: Queryable, id: string): Promise<AccessGrant | undefined> {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, owner_user_id, viewer_email FROM dashboard_access WHERE id = ? AND revoked_at IS NULL',
    [id],
  );
  const r = rows[0];
  return r ? { id: String(r.id), ownerUserId: String(r.owner_user_id), viewerEmail: String(r.viewer_email) } : undefined;
}

/** Makes the env-managed grant match the current configuration. Safe to run repeatedly. */
export async function syncEnvAccess(): Promise<void> {
  const { enabled, viewerEmail, ownerEmail } = config.dashboard;
  await withTransaction(async (conn) => {
    const now = new Date();
    if (!enabled) {
      await conn.execute("UPDATE dashboard_access SET revoked_at = ? WHERE source = 'env' AND revoked_at IS NULL", [now]);
      return;
    }
    const [owners] = ownerEmail
      ? await conn.execute<Row[]>('SELECT id FROM users WHERE email = ?', [ownerEmail])
      : await conn.execute<Row[]>('SELECT id FROM users LIMIT 2');
    const ownerId = owners.length === 1 ? (owners[0]?.id as string) : undefined;
    if (!ownerId) {
      logger.warn(ownerEmail || owners.length === 0 ? 'dashboard_owner_not_found' : 'dashboard_owner_ambiguous');
      await conn.execute("UPDATE dashboard_access SET revoked_at = ? WHERE source = 'env' AND revoked_at IS NULL", [now]);
      return;
    }
    // Revoke env grants that no longer match the configuration.
    await conn.execute(
      `UPDATE dashboard_access SET revoked_at = ?
        WHERE source = 'env' AND revoked_at IS NULL AND NOT (viewer_email = ? AND owner_user_id = ?)`,
      [now, viewerEmail, ownerId],
    );
    const [current] = await conn.execute<Row[]>(
      `SELECT id FROM dashboard_access
        WHERE source = 'env' AND revoked_at IS NULL AND viewer_email = ? AND owner_user_id = ?`,
      [viewerEmail, ownerId],
    );
    if (current.length === 0) {
      await conn.execute(
        `INSERT INTO dashboard_access (id, owner_user_id, viewer_email, source, granted_at) VALUES (?, ?, ?, 'env', ?)`,
        [randomUUID(), ownerId, viewerEmail, now],
      );
    }
  });
}
