import * as SecureStore from 'expo-secure-store';
import type { AuthTokens, PublicUser } from '@journal/shared';

/**
 * Auth tokens and the signed-in user's public profile live in the OS keychain /
 * keystore via SecureStore — never in SQLite or plain storage. A memory copy avoids a
 * keychain read on every request.
 */
const KEY_ACCESS = 'auth.access';
const KEY_REFRESH = 'auth.refresh';
const KEY_USER = 'auth.user';

let memory: { access: string | null; refresh: string | null } = { access: null, refresh: null };

export const tokens = {
  get access() {
    return memory.access;
  },
  get refresh() {
    return memory.refresh;
  },

  async load(): Promise<{ user: PublicUser | null }> {
    const [access, refresh, user] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_USER),
    ]);
    memory = { access, refresh };
    try {
      return { user: user ? (JSON.parse(user) as PublicUser) : null };
    } catch {
      return { user: null };
    }
  },

  async save(t: AuthTokens): Promise<void> {
    memory = { access: t.accessToken, refresh: t.refreshToken };
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS, t.accessToken),
      SecureStore.setItemAsync(KEY_REFRESH, t.refreshToken),
    ]);
  },

  async saveUser(user: PublicUser): Promise<void> {
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(user));
  },

  async clear(): Promise<void> {
    memory = { access: null, refresh: null };
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_USER),
    ]);
  },
};
