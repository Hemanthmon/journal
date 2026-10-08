import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { ErrorCode, type DashboardViewer } from '@journal/shared';
import { config } from '../../config/env';
import { getPool, type Queryable } from '../../db/pool';
import { withTransaction } from '../../db/tx';
import { AppError, notFound } from '../../lib/errors';
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
  viewerName: string | null;
}

type Row = RowDataPacket & Record<string, unknown>;

const toGrant = (r: Row): AccessGrant => ({
  id: String(r.id),
  ownerUserId: String(r.owner_user_id),
  viewerEmail: String(r.viewer_email),
  viewerName: r.viewer_name == null ? null : String(r.viewer_name),
});

export async function findActiveGrant(db: Queryable, viewerEmail: string): Promise<AccessGrant | undefined> {
  const [rows] = await db.execute<Row[]>(
    `SELECT a.id, a.owner_user_id, a.viewer_email, a.viewer_name FROM dashboard_access a
      WHERE a.viewer_email = ? AND a.revoked_at IS NULL
      ORDER BY a.granted_at DESC LIMIT 1`,
    [viewerEmail],
  );
  const r = rows[0];
  return r ? toGrant(r) : undefined;
}

export async function findGrantById(db: Queryable, id: string): Promise<AccessGrant | undefined> {
  const [rows] = await db.execute<Row[]>(
    'SELECT id, owner_user_id, viewer_email, viewer_name FROM dashboard_access WHERE id = ? AND revoked_at IS NULL',
    [id],
  );
  const r = rows[0];
  return r ? toGrant(r) : undefined;
}

/** Makes the env-managed grant match the current configuration. Safe to run repeatedly. */
export async function syncEnvAccess(): Promise<void> {
  const { viewerEmail, ownerEmail } = config.dashboard;
  await withTransaction(async (conn) => {
    const now = new Date();
    if (!viewerEmail) {
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

// ------------------------------------------------------------ shared from the app

/** At most this many people can view one owner's dashboard at a time. */
export const MAX_VIEWERS = 10;

/** Everyone who can currently see the owner's dashboard, oldest first. */
export async function listViewers(db: Queryable, ownerUserId: string): Promise<DashboardViewer[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT id, viewer_email, viewer_name, source, granted_at FROM dashboard_access
      WHERE owner_user_id = ? AND revoked_at IS NULL ORDER BY granted_at`,
    [ownerUserId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.viewer_email),
    name: r.viewer_name == null ? null : String(r.viewer_name),
    managedByServer: r.source === 'env',
    grantedAt: (r.granted_at as Date).toISOString(),
  }));
}

/**
 * Gives `email` access to the owner's dashboard, or renames them if they already have it.
 * Returns whether access is new (so the caller knows to send an invitation).
 */
export async function shareAccess(
  ownerUserId: string,
  input: { name: string; email: string },
): Promise<{ viewer: DashboardViewer; created: boolean }> {
  const created = await withTransaction(async (conn) => {
    // Lock the owner's row so two simultaneous shares can't both pass the limit.
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [ownerUserId]);
    const [existing] = await conn.execute<Row[]>(
      `SELECT id FROM dashboard_access WHERE owner_user_id = ? AND viewer_email = ? AND revoked_at IS NULL`,
      [ownerUserId, input.email],
    );
    if (existing.length) {
      await conn.execute('UPDATE dashboard_access SET viewer_name = ? WHERE id = ?', [input.name, existing[0]!.id]);
      return false;
    }
    const [count] = await conn.execute<Row[]>(
      'SELECT COUNT(*) AS n FROM dashboard_access WHERE owner_user_id = ? AND revoked_at IS NULL',
      [ownerUserId],
    );
    if (Number(count[0]?.n ?? 0) >= MAX_VIEWERS) {
      throw new AppError(409, ErrorCode.CONFLICT, `You can share with up to ${MAX_VIEWERS} people. Remove someone first.`);
    }
    await conn.execute(
      `INSERT INTO dashboard_access (id, owner_user_id, viewer_email, viewer_name, source, granted_at)
       VALUES (?, ?, ?, ?, 'manual', ?)`,
      [randomUUID(), ownerUserId, input.email, input.name, new Date()],
    );
    return true;
  });
  const viewer = (await listViewers(getPool(), ownerUserId)).find((v) => v.email === input.email)!;
  return { viewer, created };
}

/** Ends a viewer's access immediately (their open sessions stop on the next request). */
export async function revokeViewer(ownerUserId: string, grantId: string): Promise<void> {
  const [rows] = await getPool().execute<Row[]>(
    'SELECT source FROM dashboard_access WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL',
    [grantId, ownerUserId],
  );
  const row = rows[0];
  if (!row) throw notFound('This person no longer has access');
  if (row.source === 'env') {
    throw new AppError(409, ErrorCode.CONFLICT, 'This access is set in the server settings (DASHBOARD_VIEWER_EMAIL).');
  }
  await getPool().execute('UPDATE dashboard_access SET revoked_at = ? WHERE id = ?', [new Date(), grantId]);
}
