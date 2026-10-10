import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Text, View, useColorScheme } from 'react-native';

/** Short thoughts shown while the app opens; a different one each time. */
export const THOUGHTS = [
  'Small steps, every day.',
  'Every action is a vote for who you are becoming.',
  'You don’t rise to your goals. You fall to your systems.',
  'Missing once is an accident. Missing twice is a new habit.',
  'Urges are waves. You can ride this one out.',
  'Be gentle with yourself. Growth is quiet.',
  'One percent better today is enough.',
  'Make it easy. Start with two minutes.',
  'Breathe in slowly. Breathe out longer.',
  'You have urges. You are not your urges.',
  'Progress, not perfection.',
  'The person you want to be is built in moments like this.',
  'Notice. Name it. Let it pass.',
  'Your future self is grateful for today’s choices.',
  'Rest is part of the work.',
  'What you repeat, you become.',
  'Start where you are. Use what you have.',
  'A calm mind makes wise choices.',
  'Be the kind of person who keeps promises to yourself.',
  'Tiny wins add up to a different life.',
  'Discomfort passes. Pride lasts.',
  'Today is a fresh page.',
];

/** Same colours and logo as the native splash (app.json), so the handover is seamless. */
const BG = { light: '#EEF3EC', dark: '#121A16' };
const LOGO = 220;
/** Long enough to read a thought, short enough not to be in the way. */
const MIN_MS = 1800;

export function LaunchScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const dark = useColorScheme() === 'dark';
  const [thought] = useState(() => THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)]!);
  const textIn = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const [minPassed, setMinPassed] = useState(false);

  useEffect(() => {
    // The native splash shows the same picture; swap to this one and fade the thought in.
    void SplashScreen.hideAsync();
    let reduce = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduce = r));
    Animated.timing(textIn, { toValue: 1, duration: 600, delay: 250, useNativeDriver: true }).start();
    const t = setTimeout(() => setMinPassed(true), reduce ? 900 : MIN_MS);
    return () => clearTimeout(t);
  }, [textIn]);

  useEffect(() => {
    if (!ready || !minPassed) return;
    Animated.timing(out, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onDone());
  }, [ready, minPassed, out, onDone]);

  return (
    <Animated.View
      accessible
      accessibilityLabel={`Journal is opening. ${thought}`}
      style={{ flex: 1, backgroundColor: dark ? BG.dark : BG.light, alignItems: 'center', justifyContent: 'center', opacity: out }}
    >
      <Image
        source={dark ? require('../../assets/splash-icon-dark.png') : require('../../assets/splash-icon.png')}
        style={{ width: LOGO, height: LOGO }}
        resizeMode="contain"
      />
      {/* Below the centred logo, so the logo itself never moves. */}
      <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: LOGO / 2 + 8, paddingHorizontal: 40, alignItems: 'center' }}>
        <Animated.Text
          style={{
            opacity: textIn,
            transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            color: dark ? '#DCEBDF' : '#2F4A3B',
            fontSize: 18,
            lineHeight: 26,
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          “{thought}”
        </Animated.Text>
        <Text style={{ marginTop: 18, color: dark ? '#7FA596' : '#6A8573', fontSize: 12, letterSpacing: 3, fontWeight: '600' }}>JOURNAL</Text>
      </View>
    </Animated.View>
  );
}
