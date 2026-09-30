import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DashboardMe } from '@journal/shared';
import { api, setUnauthenticatedHandler } from './api';

interface SessionValue {
  me: DashboardMe | null;
  status: 'loading' | 'signedOut' | 'signedIn';
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<DashboardMe | null>(null);
  const [status, setStatus] = useState<SessionValue['status']>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ data: DashboardMe }>('/me');
      setMe(res.data.data);
      setStatus('signedIn');
    } catch {
      setMe(null);
      setStatus('signedOut');
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setMe(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setMe(null);
      setStatus('signedOut');
    });
    void refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ me, status, refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** The signed-in context. Only use inside signed-in pages. */
export function useMe(): DashboardMe {
  const { me } = useSession();
  if (!me) throw new Error('useMe while signed out');
  return me;
}
