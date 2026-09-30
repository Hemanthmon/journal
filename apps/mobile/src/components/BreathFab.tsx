import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useSystemInsets } from '../hooks/useSystemInsets';
import { useTheme } from '../lib/theme';

/** Height of the bottom tab bar above the safe-area inset (React Navigation's default). */
const TAB_BAR_HEIGHT = 49;
const SIZE = 60;

/** Main tab screens only; hidden on forms/editors so it never covers a Save button. */
const VISIBLE_ON = new Set(['/', '/routine', '/urges', '/profile']);

/**
 * Floating "breathe" button: one tap from any main screen opens the 2-minute breathing
 * exercise, for when an urge hits. Hidden while the keyboard is open.
 */
export function BreathFab() {
  const { c } = useTheme();
  const insets = useSystemInsets();
  const pathname = usePathname();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!VISIBLE_ON.has(pathname) || keyboardOpen) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', right: 16 + insets.right, bottom: TAB_BAR_HEIGHT + insets.bottom + 16 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Breathe"
        accessibilityHint="Opens the 2-minute breathing exercise for riding out an urge"
        onPress={() => router.navigate('/urges/breathe', { withAnchor: true })}
        hitSlop={8}
        style={({ pressed }) => ({
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          backgroundColor: c.success,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          // Lifted look on both platforms.
          elevation: 6,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        })}
      >
        <Ionicons name="leaf" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
