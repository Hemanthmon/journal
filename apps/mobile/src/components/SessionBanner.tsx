import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { radius, space, useTheme } from '../lib/theme';
import { useSession } from '../state/session';

/** Shown when the session expired: the app keeps working offline, sync resumes after signing in. */
export function SessionBanner() {
  const needsReauth = useSession((s) => s.needsReauth);
  const { c } = useTheme();
  if (!needsReauth) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in again to resume syncing"
      onPress={() => router.push('/profile/reauth')}
      style={{ backgroundColor: c.primarySoft, padding: space.md, borderRadius: radius.md }}
    >
      <Text style={{ color: c.primary, fontWeight: '600' }}>
        Sign in again to resume syncing. Your entries are safe on this device.
      </Text>
    </Pressable>
  );
}
