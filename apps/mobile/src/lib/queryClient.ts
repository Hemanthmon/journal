import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query caches reads from the local SQLite repositories (not the network).
 * Local data is always "fresh"; screens refresh by invalidation after local writes and
 * after each sync.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

export function refreshLocalQueries() {
  void queryClient.invalidateQueries();
}
