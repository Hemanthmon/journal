import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { addDays, type BlockColor, type TimeBlockRecord } from '@journal/shared';
import { getPool } from '../../db/pool';
import { describeError, logger } from '../../lib/logger';
import { localDateIn, localTimeIn, safeTimeZone } from '../../lib/tz';
import { findRecord, rowToRecord } from '../../records/records';
import { onBlocksChanged, writeBlock } from '../calendar/blocks';
import { GoogleApiError, decryptToken, getGoogleApi, type EventBody, type GoogleEvent } from './client';
import { config } from '../../config/env';

/**
 * Two-way sync between time blocks and the user's Google Calendar.
 *
 *  Push: every block whose version (server_seq) is newer than the version Google has
 *        (google_event_links.pushed_seq) is created, updated or deleted in Google.
 *  Pull: events changed in Google since the last pull (in a window around today) are
 *        written back as blocks; our own writes are recognised and skipped.
 *
 * Runs after the app pushes blocks or the owner edits them on the web, and before the app
 * pulls (so it sees Google's changes). A failed run simply catches up on the next one.
 */

type Row = RowDataPacket & Record<string, unknown>;

/** Google event colours: https://developers.google.com/calendar/api/v3/reference/colors */
const TO_GOOGLE: Record<BlockColor, string> = { lavender: '1', sage: '2', rose: '4', sand: '5', peach: '6', sky: '7' };
const FROM_GOOGLE: Record<string, BlockColor> = {
  '1': 'lavender', '2': 'sage', '3': 'lavender', '4': 'rose', '5': 'sand', '6': 'peach',
  '7': 'sky', '8': 'sand', '9': 'sky', '10': 'sage', '11': 'rose',
};

const PULL_THROTTLE_MS = 60_000;
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;

interface Account {
  userId: string;
  refreshToken: string;
  calendarId: string;
  lastPulledAt: Date | null;
  timezone: string;
}

async function loadAccount(userId: string): Promise<Account | undefined> {
  const [rows] = await getPool().execute<Row[]>(
    `SELECT g.refresh_token, g.calendar_id, g.last_pulled_at, u.timezone
       FROM google_accounts g JOIN users u ON u.id = g.user_id WHERE g.user_id = ?`,
    [userId],
  );
  const r = rows[0];
  if (!r) return undefined;
  return {
    userId,
    refreshToken: decryptToken(r.refresh_token as Buffer),
    calendarId: String(r.calendar_id),
    lastPulledAt: (r.last_pulled_at as Date | null) ?? null,
    timezone: safeTimeZone(String(r.timezone)),
  };
}

export function eventBody(b: TimeBlockRecord, timeZone: string): EventBody {
  return {
    summary: b.title,
    description: b.notes ?? '',
    colorId: TO_GOOGLE[b.color],
    start: { dateTime: `${b.localDate}T${b.startTime.slice(0, 5)}:00`, timeZone },
    end: { dateTime: `${b.localDate}T${b.endTime.slice(0, 5)}:00`, timeZone },
    extendedProperties: { private: { journalBlockId: b.id } },
  };
}

async function saveLink(userId: string, blockId: string, eventId: string, pushedSeq: number, googleUpdated: string | null) {
  await getPool().execute(
    `INSERT INTO google_event_links (block_id, user_id, event_id, pushed_seq, google_updated) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE event_id = VALUES(event_id), pushed_seq = VALUES(pushed_seq), google_updated = VALUES(google_updated)`,
    [blockId, userId, eventId, pushedSeq, googleUpdated],
  );
}

async function pushChanges(acc: Account, token: string): Promise<number> {
  const g = getGoogleApi();
  const [rows] = await getPool().query<Row[]>(
    `SELECT b.server_seq, b.id, b.created_at, b.updated_at, b.deleted_at, b.title, b.local_date, b.start_time, b.end_time,
            b.color, b.identity_id, b.notes, l.event_id
       FROM time_blocks b LEFT JOIN google_event_links l ON l.block_id = b.id
      WHERE b.user_id = ? AND b.server_seq > COALESCE(l.pushed_seq, 0)
        AND (l.block_id IS NOT NULL OR b.deleted_at IS NULL)
      ORDER BY b.server_seq LIMIT 200`,
    [acc.userId],
  );
  for (const r of rows) {
    const block = rowToRecord('timeBlocks', r);
    const eventId = r.event_id ? String(r.event_id) : null;
    if (block.deletedAt) {
      if (eventId) await g.deleteEvent(token, acc.calendarId, eventId);
      await getPool().execute('DELETE FROM google_event_links WHERE block_id = ?', [block.id]);
      continue;
    }
    const body = eventBody(block, acc.timezone);
    let ev: GoogleEvent;
    try {
      ev = eventId ? await g.patchEvent(token, acc.calendarId, eventId, body) : await g.insertEvent(token, acc.calendarId, body);
    } catch (e) {
      // The event was deleted in Google meanwhile: recreate it.
      if (!(eventId && e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
      ev = await g.insertEvent(token, acc.calendarId, body);
    }
    await saveLink(acc.userId, block.id, ev.id, block.serverSeq, ev.updated ?? null);
  }
  return rows.length;
}

/** Local date and "HH:MM" of a Google dateTime in the owner's time zone. */
function local(dt: string, tz: string) {
  const d = new Date(dt);
  return { date: localDateIn(d, tz), time: localTimeIn(d, tz) };
}

async function pullChanges(acc: Account, token: string): Promise<number> {
  const g = getGoogleApi();
  const startedAt = new Date();
  const today = localDateIn(startedAt, acc.timezone);
  let pageToken: string | undefined;
  let changed = 0;
  do {
    const page = await g.listEvents(token, acc.calendarId, {
      timeMin: `${addDays(today, -WINDOW_PAST_DAYS)}T00:00:00Z`,
      timeMax: `${addDays(today, WINDOW_FUTURE_DAYS)}T00:00:00Z`,
      // A minute of overlap so nothing slips between two runs.
      updatedMin: acc.lastPulledAt ? new Date(acc.lastPulledAt.getTime() - 60_000).toISOString() : undefined,
      pageToken,
    });
    for (const ev of page.items) {
      try {
        if (await importEvent(acc, ev)) changed++;
      } catch (e) {
        // One odd event shouldn't stop the rest.
        logger.warn('google_event_import_failed', describeError(e));
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  await getPool().execute('UPDATE google_accounts SET last_pulled_at = ? WHERE user_id = ?', [startedAt, acc.userId]);
  return changed;
}

/** Applies one Google event to the blocks. Returns whether a block changed. */
export async function importEvent(acc: Pick<Account, 'userId' | 'timezone'>, ev: GoogleEvent): Promise<boolean> {
  const [links] = await getPool().execute<Row[]>(
    'SELECT block_id, google_updated FROM google_event_links WHERE user_id = ? AND event_id = ?',
    [acc.userId, ev.id],
  );
  const link = links[0];
  const tagged = ev.extendedProperties?.private?.journalBlockId;
  const blockId = link ? String(link.block_id) : tagged;
  const existing = blockId ? await findRecord(getPool(), 'timeBlocks', acc.userId, blockId, { includeDeleted: true }) : undefined;

  if (ev.status === 'cancelled') {
    if (existing && !existing.deletedAt) await writeBlock(acc.userId, { ...existing, deletedAt: new Date().toISOString() }, { notify: false });
    await getPool().execute('DELETE FROM google_event_links WHERE user_id = ? AND event_id = ?', [acc.userId, ev.id]);
    return !!existing && !existing.deletedAt;
  }
  // Our own write coming back, or nothing new since we last saw it.
  if (link && ev.updated && link.google_updated === ev.updated) return false;
  // All-day events aren't time blocks.
  if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
  // A block deleted in the app stays deleted; its delete is pushed to Google next.
  if (existing?.deletedAt) return false;

  const start = local(ev.start.dateTime, acc.timezone);
  const end = local(ev.end.dateTime, acc.timezone);
  const endTime = end.date === start.date ? end.time : '23:59';
  if (endTime <= start.time) return false;

  const now = new Date().toISOString();
  const record: TimeBlockRecord = {
    id: existing?.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    title: (ev.summary?.trim() || '(No title)').slice(0, 200),
    localDate: start.date,
    startTime: start.time,
    endTime,
    color: (ev.colorId && FROM_GOOGLE[ev.colorId]) || existing?.color || 'sky',
    identityId: existing?.identityId ?? null,
    notes: ev.description?.trim() ? ev.description.trim().slice(0, 2000) : null,
  };
  const same =
    existing &&
    existing.title === record.title &&
    existing.localDate === record.localDate &&
    existing.startTime.slice(0, 5) === record.startTime &&
    existing.endTime.slice(0, 5) === record.endTime &&
    existing.color === record.color &&
    (existing.notes ?? null) === record.notes;
  if (same) {
    await saveLink(acc.userId, existing.id, ev.id, existing.serverSeq, ev.updated ?? null);
    return false;
  }
  const stored = await writeBlock(acc.userId, record, { notify: false });
  // Google already has this version: don't push it back.
  await saveLink(acc.userId, stored.id, ev.id, stored.serverSeq, ev.updated ?? null);
  return true;
}

// ------------------------------------------------------------------ orchestration

const running = new Map<string, Promise<void>>();

/**
 * Push, then (unless pulled in the last minute, or `force`) pull. One run per user at a
 * time; a call during a run waits for it. Never throws: errors are recorded and logged.
 */
export function syncGoogle(userId: string, opts: { pull?: boolean; force?: boolean } = {}): Promise<void> {
  if (!config.google.enabled) return Promise.resolve();
  const current = running.get(userId);
  if (current) return current;
  const run = (async () => {
    const acc = await loadAccount(userId);
    if (!acc) return;
    try {
      const token = await getGoogleApi().accessToken(acc.refreshToken);
      await pushChanges(acc, token);
      const due = !acc.lastPulledAt || Date.now() - acc.lastPulledAt.getTime() >= PULL_THROTTLE_MS;
      if (opts.pull !== false && (opts.force || due)) await pullChanges(acc, token);
      await getPool().execute('UPDATE google_accounts SET last_sync_at = ?, last_error = NULL WHERE user_id = ?', [new Date(), userId]);
    } catch (e) {
      const reason =
        e instanceof GoogleApiError && (e.reason === 'invalid_grant' || e.status === 401)
          ? 'Google access was revoked. Connect again.'
          : 'Sync with Google failed. It will retry.';
      await getPool().execute('UPDATE google_accounts SET last_error = ? WHERE user_id = ?', [reason, userId]);
      logger.error('google_sync_failed', {
        ...describeError(e),
        status: e instanceof GoogleApiError ? e.status : undefined,
        reason: e instanceof GoogleApiError ? e.reason : undefined,
      });
    }
  })().finally(() => running.delete(userId));
  running.set(userId, run);
  return run;
}

/** Waits for a pull, but never longer than `ms`, so the app's sync stays snappy. */
export async function syncGoogleWithin(userId: string, ms: number): Promise<void> {
  await Promise.race([syncGoogle(userId), new Promise((r) => setTimeout(r, ms).unref())]);
}

// Blocks changed on the web: send them to Google in the background.
onBlocksChanged((userId) => void syncGoogle(userId, { pull: false }));
