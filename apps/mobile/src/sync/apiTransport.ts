import { AxiosError } from 'axios';
import type { ApiErrorBody, PullResponse, PushRequest, PushResponse } from '@journal/shared';
import { api } from '../api/client';
import { TransportError, type SyncTransport } from './engine';

function toTransportError(err: unknown): TransportError {
  if (err instanceof AxiosError) {
    if (!err.response) return new TransportError('network', "Can't reach the server");
    const code = (err.response.data as ApiErrorBody | undefined)?.error?.code;
    if (err.response.status === 409 && code === 'EPOCH_CHANGED') return new TransportError('epoch', 'Data was reset');
    if (err.response.status === 401) return new TransportError('auth', 'Please sign in again to sync');
    return new TransportError('server', `Server error (${err.response.status})`);
  }
  return new TransportError('server', err instanceof Error ? err.message : 'Sync failed');
}

export const apiTransport: SyncTransport = {
  async push(req: PushRequest) {
    try {
      return (await api.post<{ data: PushResponse }>('/sync/push', req)).data.data;
    } catch (err) {
      throw toTransportError(err);
    }
  },
  async pull(cursor: number, limit: number) {
    try {
      return (await api.get<{ data: PullResponse }>('/sync/pull', { params: { cursor, limit } })).data.data;
    } catch (err) {
      throw toTransportError(err);
    }
  },
};
