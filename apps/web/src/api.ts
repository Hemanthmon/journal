import axios, { AxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import type { ApiErrorBody } from '@journal/shared';

/**
 * Same-origin API client. The session lives in an HttpOnly cookie set by the server, so
 * no token is ever handled (or stored) by this code.
 */
export const api = axios.create({ baseURL: '/api/dashboard', withCredentials: true, timeout: 60_000 });

let onUnauthenticated: () => void = () => {};
export function setUnauthenticatedHandler(fn: () => void) {
  onUnauthenticated = fn;
}

api.interceptors.response.use(undefined, (err: AxiosError) => {
  if (err.response?.status === 401 && !err.config?.url?.startsWith('/auth/')) onUnauthenticated();
  throw err;
});

export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    if (!err.response) return "Can't reach the server. It may be waking up — try again in a moment.";
    const body = err.response.data as ApiErrorBody | undefined;
    return body?.error?.details?.[0]?.message ?? body?.error?.message ?? `Request failed (${err.response.status})`;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

/** Fetches `url` (re-fetching when it changes). */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: T }>(url);
      setData(res.data.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
