import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../../config/env';

/**
 * Minimal Google OAuth + Calendar v3 client over fetch (no SDK). Tests replace it with a
 * fake through `setGoogleApi`.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];

// ------------------------------------------------------------------ refresh token at rest

const key = () => createHash('sha256').update(`google-token:${config.google.tokenKey}`).digest();

/** AES-256-GCM: 12-byte IV | 16-byte tag | ciphertext. */
export function encryptToken(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decryptToken(blob: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
}

// ------------------------------------------------------------------ API surface

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  colorId?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export type EventBody = Omit<GoogleEvent, 'id' | 'updated' | 'status'>;

export interface ListParams {
  timeMin: string;
  timeMax: string;
  updatedMin?: string;
  pageToken?: string;
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Google API ${status} ${reason}`);
    this.name = 'GoogleApiError';
  }
}

export interface GoogleApi {
  /** Exchanges an authorization code. */
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string | null; email: string | null }>;
  /** A short-lived access token (cached until shortly before it expires). */
  accessToken(refreshToken: string): Promise<string>;
  listEvents(token: string, calendarId: string, p: ListParams): Promise<{ items: GoogleEvent[]; nextPageToken?: string }>;
  insertEvent(token: string, calendarId: string, body: EventBody): Promise<GoogleEvent>;
  patchEvent(token: string, calendarId: string, eventId: string, body: EventBody): Promise<GoogleEvent>;
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
}

export function authUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on reconnect.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { errors?: { reason?: string }[]; status?: string } | string | undefined;
    const reason = typeof err === 'string' ? err : (err?.errors?.[0]?.reason ?? err?.status ?? 'error');
    throw new GoogleApiError(res.status, String(reason));
  }
  return body as T;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const httpGoogle: GoogleApi = {
  async exchangeCode(code, redirectUri) {
    const r = await call<{ refresh_token?: string; id_token?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    // The id_token came straight from Google over TLS; only its email is read, for display.
    let email: string | null = null;
    try {
      const payload = JSON.parse(Buffer.from(String(r.id_token).split('.')[1] ?? '', 'base64url').toString('utf8'));
      email = typeof payload.email === 'string' ? payload.email : null;
    } catch {
      // No email; fine.
    }
    return { refreshToken: r.refresh_token ?? null, email };
  },

  async accessToken(refreshToken) {
    const hit = tokenCache.get(refreshToken);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
    const r = await call<{ access_token: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    tokenCache.set(refreshToken, { token: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 });
    return r.access_token;
  },

  async listEvents(token, calendarId, p) {
    const q = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '250',
      timeMin: p.timeMin,
      timeMax: p.timeMax,
    });
    if (p.updatedMin) q.set('updatedMin', p.updatedMin);
    if (p.pageToken) q.set('pageToken', p.pageToken);
    return call(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  },

  insertEvent(token, calendarId, body) {
    return call(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  patchEvent(token, calendarId, eventId, body) {
    return call(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  async deleteEvent(token, calendarId, eventId) {
    try {
      await call(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
    } catch (e) {
      // Already gone in Google: that's the goal.
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  },
};

let google: GoogleApi = httpGoogle;
export const getGoogleApi = () => google;
/** Tests swap in a fake Google. */
export function setGoogleApi(g: GoogleApi) {
  google = g;
}
