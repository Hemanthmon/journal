import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from 'react-native';
import type { ReminderRecord } from '@journal/shared';
import { font, radius, space, useTheme } from '../lib/theme';

const SLIDE_MS = 5000;

/**
 * Eye-catching card with the user's daily reminders. With two or more it slides to the
 * next one every few seconds (and can be swiped). Auto-sliding pauses while the user is
 * touching it, while the screen isn't focused, and entirely when Reduce Motion is on.
 */
export function ReminderCarousel({ reminders, onPress }: { reminders: ReminderRecord[]; onPress?: () => void }) {
  const { c } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const touching = useRef(false);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const count = reminders.length;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // Keep the position valid when reminders are added or removed.
  useEffect(() => {
    if (indexRef.current >= count) {
      indexRef.current = 0;
      setIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [count]);

  const goTo = useCallback(
    (i: number) => {
      indexRef.current = i;
      setIndex(i);
      scrollRef.current?.scrollTo({ x: i * width, animated: true });
    },
    [width],
  );

  useFocusEffect(
    useCallback(() => {
      if (count < 2 || reduceMotion || width === 0) return;
      const id = setInterval(() => {
        if (!touching.current) goTo((indexRef.current + 1) % count);
      }, SLIDE_MS);
      return () => clearInterval(id);
    }, [count, reduceMotion, width, goTo]),
  );

  if (count === 0) return null;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ backgroundColor: c.primary, borderRadius: radius.lg, overflow: 'hidden' }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={count > 1}
        onScrollBeginDrag={() => {
          touching.current = true;
        }}
        onScrollEndDrag={() => {
          touching.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          if (!width) return;
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          indexRef.current = i;
          setIndex(i);
        }}
      >
        {reminders.map((r, i) => (
          <Pressable
            key={r.id}
            onPress={onPress}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={`Reminder${count > 1 ? ` ${i + 1} of ${count}` : ''}: ${r.text}`}
            accessibilityHint={onPress ? 'Opens your daily reminders' : undefined}
            style={{ width: width || undefined, padding: space.lg, gap: space.sm, minHeight: 120, justifyContent: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Ionicons name="sparkles" size={16} color={c.primaryText} />
              <Text style={{ color: c.primaryText, fontSize: 12, fontWeight: '700', letterSpacing: 1, opacity: 0.9 }}>
                REMINDER
              </Text>
            </View>
            <Text style={{ color: c.primaryText, fontSize: font.large + 2, fontWeight: '700', lineHeight: 26 }}>
              {r.text}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {count > 1 && (
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: space.md }}
        >
          {reminders.map((r, i) => (
            <View
              key={r.id}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: c.primaryText,
                opacity: i === index ? 1 : 0.45,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
