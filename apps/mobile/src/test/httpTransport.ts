import type { PullResponse, PushRequest, PushResponse } from '@journal/shared';
import { TransportError, type SyncTransport } from '../sync/engine';

/** fetch-based transport for tests against a real API server, with a switchable "network". */
export function httpTransport(baseUrl: string, token: string) {
  const state = { online: true, requests: 0 };
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!state.online) throw new TransportError('network', 'Network request failed');
    state.requests++;
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { data?: T; error?: { code: string; message: string } };
    if (res.status === 409 && body.error?.code === 'EPOCH_CHANGED') throw new TransportError('epoch', body.error.message);
    if (res.status === 401) throw new TransportError('auth', 'Unauthenticated');
    if (!res.ok) throw new TransportError('server', body.error?.message ?? `HTTP ${res.status}`);
    return body.data as T;
  }
  const transport: SyncTransport = {
    push: (req: PushRequest) => call<PushResponse>('/api/sync/push', { method: 'POST', body: JSON.stringify(req) }),
    pull: (cursor, limit) => call<PullResponse>(`/api/sync/pull?cursor=${cursor}&limit=${limit}`),
  };
  return { transport, state };
}
