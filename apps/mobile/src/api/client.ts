import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, AuthResponse } from '@journal/shared';
import { API_URL } from '../lib/config';
import { tokens } from './tokens';

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 20_000 });

api.interceptors.request.use((cfg) => {
  if (tokens.access) cfg.headers.set('Authorization', `Bearer ${tokens.access}`);
  return cfg;
});

type RefreshResult = 'ok' | 'invalid' | 'network';
let refreshing: Promise<RefreshResult> | null = null;
let onSessionExpired: () => void = () => {};

/** Called when the refresh token is rejected: the user must sign in again (local data is kept). */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

/** Exchanges the refresh token for new tokens. Concurrent callers share one request. */
export function refreshTokens(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    const refreshToken = tokens.refresh;
    if (!refreshToken) return 'invalid';
    try {
      const res = await axios.post<{ data: AuthResponse }>(`${API_URL}/api/auth/refresh`, { refreshToken }, { timeout: 20_000 });
      await tokens.save(res.data.data.tokens);
      await tokens.saveUser(res.data.data.user);
      return 'ok';
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) return 'invalid';
      return 'network';
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.response.use(undefined, async (error: AxiosError<ApiErrorBody>) => {
  const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
  const code = error.response?.data?.error?.code;
  if (
    cfg &&
    !cfg._retried &&
    error.response?.status === 401 &&
    !cfg.url?.startsWith('/auth/') &&
    (code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED')
  ) {
    cfg._retried = true;
    const result = await refreshTokens();
    if (result === 'ok') return api(cfg);
    if (result === 'invalid') onSessionExpired();
  }
  throw error;
});

export function isNetworkError(err: unknown): boolean {
  return err instanceof AxiosError && !err.response;
}

/** A short, human message for an API error. Never includes submitted values. */
export function describeError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (!err.response) return "Can't reach the server. Check your connection and try again.";
    const body = err.response.data as ApiErrorBody | undefined;
    const detail = body?.error?.details?.[0]?.message;
    return detail ?? body?.error?.message ?? `Request failed (${err.response.status})`;
  }
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues: { message: string }[] }).issues;
    if (issues[0]) return issues[0].message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
