import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { ErrorCode, type ApiSuccess } from '@journal/shared';
import { config } from '../../config/env';
import { getPool } from '../../db/pool';
import { AppError } from '../../lib/errors';
import { describeError, logger } from '../../lib/logger';
import { authenticate, requireUserId } from '../../middleware/authenticate';
import { authUrl, encryptToken, getGoogleApi } from './client';
import { syncGoogle } from './sync';

type Row = RowDataPacket & Record<string, unknown>;

export interface GoogleStatus {
  /** The server has Google credentials configured. */
  available: boolean;
  connected: boolean;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const STATE_AUDIENCE = 'google-connect';
const baseUrl = (req: Request) => config.google.publicUrl || `${req.protocol}://${req.get('host')}`;
const redirectUri = (req: Request) => `${baseUrl(req)}/api/google/callback`;

function unavailable() {
  return new AppError(503, ErrorCode.INTERNAL_ERROR, "Google Calendar sync isn't set up on the server yet.");
}

async function status(userId: string): Promise<GoogleStatus> {
  const [rows] = await getPool().execute<Row[]>(
    'SELECT google_email, last_sync_at, last_error FROM google_accounts WHERE user_id = ?',
    [userId],
  );
  const r = rows[0];
  return {
    available: config.google.enabled,
    connected: !!r,
    googleEmail: r?.google_email ? String(r.google_email) : null,
    lastSyncAt: r?.last_sync_at ? (r.last_sync_at as Date).toISOString() : null,
    lastError: r?.last_error ? String(r.last_error) : null,
  };
}

function page(title: string, message: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef3f0;color:#24352a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;">
<div style="background:#fbfdf9;border-radius:20px;padding:32px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(31,77,54,.08);">
<div style="font-size:40px">🌿</div><h1 style="font-size:22px;margin:12px 0 8px;">${esc(title)}</h1>
<p style="color:#647766;line-height:1.5;margin:0;">${esc(message)}</p></div></body></html>`;
}

/**
 * Connecting Google Calendar:
 *  1. The app (signed in) asks for a connect link: a short-lived signed `state`.
 *  2. The phone's browser opens it; /start redirects to Google's consent screen.
 *  3. Google redirects to /callback with a code; the refresh token is stored encrypted.
 */
export function googleRouter(): Router {
  const router = Router();

  router.get('/status', authenticate, async (req, res) => {
    const body: ApiSuccess<GoogleStatus> = { data: await status(requireUserId(req)) };
    res.json(body);
  });

  router.post('/connect-link', authenticate, (req, res) => {
    if (!config.google.enabled) throw unavailable();
    const state = jwt.sign({ uid: requireUserId(req) }, config.auth.accessSecret, {
      algorithm: 'HS256',
      audience: STATE_AUDIENCE,
      expiresIn: 600,
    });
    res.json({ data: { url: `${baseUrl(req)}/api/google/start?state=${encodeURIComponent(state)}` } });
  });

  const readState = (state: unknown): string | null => {
    try {
      const p = jwt.verify(String(state), config.auth.accessSecret, { algorithms: ['HS256'], audience: STATE_AUDIENCE });
      return typeof p === 'object' && typeof p.uid === 'string' ? p.uid : null;
    } catch {
      return null;
    }
  };

  router.get('/start', (req, res) => {
    if (!config.google.enabled) return void res.status(503).send(page('Not available', "Google Calendar sync isn't set up on the server yet."));
    if (!readState(req.query.state)) {
      return void res.status(400).send(page('Link expired', 'Go back to the app and tap Connect again.'));
    }
    res.redirect(authUrl(redirectUri(req), String(req.query.state)));
  });

  router.get('/callback', async (req, res) => {
    const userId = readState(req.query.state);
    if (!userId) return void res.status(400).send(page('Link expired', 'Go back to the app and tap Connect again.'));
    if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') {
      return void res.send(page('Not connected', 'Google Calendar was not connected. You can try again from the app.'));
    }
    try {
      const { refreshToken, email } = await getGoogleApi().exchangeCode(req.query.code, redirectUri(req));
      if (!refreshToken) throw new Error('no refresh token');
      const [prev] = await getPool().execute<Row[]>('SELECT google_email FROM google_accounts WHERE user_id = ?', [userId]);
      // A different Google account: its calendar has none of our events yet.
      if (prev[0] && prev[0].google_email !== email) {
        await getPool().execute('DELETE FROM google_event_links WHERE user_id = ?', [userId]);
      }
      await getPool().execute(
        `INSERT INTO google_accounts (user_id, google_email, refresh_token, calendar_id, connected_at, last_pulled_at)
         VALUES (?, ?, ?, 'primary', ?, NULL)
         ON DUPLICATE KEY UPDATE google_email = VALUES(google_email), refresh_token = VALUES(refresh_token),
           connected_at = VALUES(connected_at), last_pulled_at = NULL, last_error = NULL`,
        [userId, email, encryptToken(refreshToken), new Date()],
      );
      void syncGoogle(userId, { force: true });
      res.send(page('Google Calendar connected', 'Your blocks will now appear in Google Calendar, and events from Google in the app. You can close this page and go back to the app.'));
    } catch (e) {
      logger.error('google_connect_failed', describeError(e));
      res.status(502).send(page('Something went wrong', "Couldn't connect to Google. Go back to the app and try again."));
    }
  });

  router.post('/sync', authenticate, async (req, res) => {
    const userId = requireUserId(req);
    await syncGoogle(userId, { force: true });
    const body: ApiSuccess<GoogleStatus> = { data: await status(userId) };
    res.json(body);
  });

  /** Stops syncing. Events already in Google stay there; blocks stay in the app. */
  router.delete('/', authenticate, async (req, res) => {
    const userId = requireUserId(req);
    await getPool().execute('DELETE FROM google_event_links WHERE user_id = ?', [userId]);
    await getPool().execute('DELETE FROM google_accounts WHERE user_id = ?', [userId]);
    res.status(204).end();
  });

  return router;
}
