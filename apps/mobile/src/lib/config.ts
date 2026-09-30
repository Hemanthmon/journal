/**
 * API base URL, from EXPO_PUBLIC_API_URL (see .env.example). Inlined at build time.
 * Production builds must use https://.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

if (!__DEV__ && !API_URL.startsWith('https://')) {
  console.warn('EXPO_PUBLIC_API_URL should use https:// in production builds');
}
