import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { DashboardActivity, ViewerActivity } from '@journal/shared';
import { getPool } from '../../db/pool';
import { describeError, logger } from '../../lib/logger';

/**
 * Who looked at the owner's dashboard, when, and for how long. A visit starts with a
 * request and is extended by each later request or heartbeat (the website sends one a
 * minute while its tab is visible); a gap of 30 minutes starts a new visit.
 */

type Row = RowDataPacket & Record<string, unknown>;

const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;
/** Don't write on every request: once a minute is enough to measure time spent. */
const TOUCH_EVERY_MS = 45 * 1000;

/** "Chrome on Windows", "Safari on iPhone"… from the User-Agent, nothing more precise. */
export function deviceOf(ua: string | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  const text = [browser, os].filter(Boolean).join(' on ');
  return text ? text.slice(0, 60) : null;
}

const cache = new Map<string, { visitId: string; lastSeen: number }>();

/** Records activity for a viewer's grant. Never throws (tracking must not break the page). */
export async function trackVisit(
  grant: { id: string; ownerUserId: string; viewerEmail: string },
  ua: string | undefined,
  opts: { signedIn?: boolean } = {},
): Promise<void> {
  try {
    const now = Date.now();
    let current = cache.get(grant.id);
    if (!current) {
      const [rows] = await getPool().execute<Row[]>(
        'SELECT id, last_seen_at FROM dashboard_visits WHERE grant_id = ? ORDER BY last_seen_at DESC LIMIT 1',
        [grant.id],
      );
      if (rows[0]) current = { visitId: String(rows[0].id), lastSeen: (rows[0].last_seen_at as Date).getTime() };
    }
    if (!opts.signedIn && current && now - current.lastSeen < TOUCH_EVERY_MS) return;
    if (opts.signedIn || !current || now - current.lastSeen >= NEW_VISIT_AFTER_MS) {
      const id = randomUUID();
      await getPool().execute(
        `INSERT INTO dashboard_visits (id, grant_id, owner_user_id, viewer_email, signed_in, device, started_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, grant.id, grant.ownerUserId, grant.viewerEmail, opts.signedIn ? 1 : 0, deviceOf(ua), new Date(now), new Date(now)],
      );
      cache.set(grant.id, { visitId: id, lastSeen: now });
      return;
    }
    await getPool().execute('UPDATE dashboard_visits SET last_seen_at = ? WHERE id = ?', [new Date(now), current.visitId]);
    cache.set(grant.id, { visitId: current.visitId, lastSeen: now });
  } catch (err) {
    logger.warn('dashboard_visit_track_failed', describeError(err));
  }
}

/** Tests start each case with a clean slate. */
export const resetVisitCache = () => cache.clear();

const minutes = (from: Date, to: Date) => Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));

/** The owner's view: each person's visits in the last `days` days, newest first. */
export async function activityFor(ownerUserId: string, days = 30, now = new Date()): Promise<DashboardActivity> {
  const since = new Date(now.getTime() - days * 86400000);
  const [rows] = await getPool().execute<Row[]>(
    `SELECT v.viewer_email, v.signed_in, v.device, v.started_at, v.last_seen_at, a.viewer_name, a.revoked_at
       FROM dashboard_visits v JOIN dashboard_access a ON a.id = v.grant_id
      WHERE v.owner_user_id = ? AND v.last_seen_at >= ?
      ORDER BY v.started_at DESC`,
    [ownerUserId, since],
  );
  const byEmail = new Map<string, ViewerActivity>();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  for (const r of rows) {
    const email = String(r.viewer_email);
    let v = byEmail.get(email);
    if (!v) {
      v = { email, name: r.viewer_name ? String(r.viewer_name) : null, hasAccess: !r.revoked_at, lastSeenAt: (r.last_seen_at as Date).toISOString(), weekMinutes: 0, visits: [] };
      byEmail.set(email, v);
    }
    const started = r.started_at as Date;
    const last = r.last_seen_at as Date;
    if (last.getTime() > Date.parse(v.lastSeenAt)) v.lastSeenAt = last.toISOString();
    const mins = minutes(started, last);
    if (last >= weekAgo) v.weekMinutes += mins;
    v.visits.push({ startedAt: started.toISOString(), lastSeenAt: last.toISOString(), minutes: mins, device: r.device ? String(r.device) : null, signedIn: !!r.signed_in });
  }
  return { viewers: [...byEmail.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)) };
}
