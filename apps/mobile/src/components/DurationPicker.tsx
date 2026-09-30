import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { formatUrgeDuration } from '@journal/shared';
import { font, radius, space, useTheme } from '../lib/theme';
import { Button } from './ui';

const ITEM = 44; // row height of a wheel
const VISIBLE = 5; // rows shown; the middle one is selected
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/**
 * One scrolling column of numbers, alarm-clock style: flick it and it snaps so one
 * number sits in the highlighted middle row.
 */
function Wheel({
  values,
  value,
  onChange,
  unit,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  const { c } = useTheme();
  const ref = useRef<ScrollView>(null);
  const [live, setLive] = useState(value);

  // Start (and re-start on reopen) at the current value.
  useEffect(() => {
    setLive(value);
    const t = setTimeout(() => ref.current?.scrollTo({ y: values.indexOf(value) * ITEM, animated: false }), 0);
    return () => clearTimeout(t);
  }, [value, values]);

  const indexAt = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.max(0, Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const v = values[indexAt(e)]!;
    setLive(v);
    if (v !== value) onChange(v);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.muted, fontSize: font.small, fontWeight: '600', marginBottom: space.xs }}>{unit}</Text>
      <View style={{ height: ITEM * VISIBLE, alignSelf: 'stretch' }}>
        {/* Highlight band behind the middle row. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: ITEM * Math.floor(VISIBLE / 2),
            left: 4,
            right: 4,
            height: ITEM,
            borderRadius: radius.md,
            backgroundColor: c.primarySoft,
          }}
        />
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          nestedScrollEnabled
          onScroll={(e) => setLive(values[indexAt(e)]!)}
          scrollEventThrottle={16}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={(e) => {
            // Android without a fling fires no momentum end; settle after the snap.
            const y = e.nativeEvent.contentOffset.y;
            if (Math.abs(y - Math.round(y / ITEM) * ITEM) < 1) settle(e);
          }}
          contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
          accessibilityRole="adjustable"
          accessibilityLabel={`${unit}: ${live}`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const i = values.indexOf(live) + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
            const v = values[Math.max(0, Math.min(values.length - 1, i))]!;
            ref.current?.scrollTo({ y: values.indexOf(v) * ITEM, animated: true });
            setLive(v);
            onChange(v);
          }}
        >
          {values.map((v) => {
            const d = Math.abs(v - live);
            return (
              <Pressable
                key={v}
                style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => {
                  ref.current?.scrollTo({ y: values.indexOf(v) * ITEM, animated: true });
                  setLive(v);
                  onChange(v);
                }}
              >
                <Text
                  style={{
                    fontSize: d === 0 ? 26 : 20,
                    fontWeight: d === 0 ? '700' : '400',
                    color: d === 0 ? c.primary : c.text,
                    opacity: d === 0 ? 1 : d === 1 ? 0.55 : 0.25,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {String(v).padStart(2, '0')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * "How long did it last?" field. Opens an alarm-style box with an hours wheel and a
 * minutes wheel. Value is whole minutes (0 = only seconds), or null when not recorded.
 */
export function DurationPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const total = Math.min(1440, h * 60 + m);

  const show = () => {
    const v = value ?? 5;
    setH(Math.min(23, Math.floor(v / 60)));
    setM(v % 60);
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value === null ? 'not set' : formatUrgeDuration(value)}. Change`}
        onPress={show}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 48,
          paddingHorizontal: space.md,
          borderWidth: 1,
          borderRadius: radius.md,
          borderColor: c.border,
          backgroundColor: c.cardAlt,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="time-outline" size={20} color={c.primary} />
        <Text style={{ flex: 1, fontSize: font.body, color: value === null ? c.muted : c.text }}>
          {value === null ? 'Tap to set (optional)' : formatUrgeDuration(value)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={c.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityLabel="Close"
          onPress={close}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg }}
        >
          {/* Inner Pressable swallows taps so they don't close the box. */}
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: c.card, borderRadius: radius.lg, padding: space.lg, gap: space.md }}
          >
            <Text style={{ color: c.text, fontSize: font.large, fontWeight: '700', textAlign: 'center' }}>
              How long did the urge last?
            </Text>

            {/* Quick choice for very short urges: saves 0 minutes, shown as "Under 1 min". */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: value === 0 }}
              onPress={() => {
                onChange(0);
                close();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.sm,
                minHeight: 48,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: value === 0 ? c.primary : c.border,
                backgroundColor: value === 0 ? c.primarySoft : c.cardAlt,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="flash-outline" size={18} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: font.body, fontWeight: '600' }}>Less than a minute</Text>
            </Pressable>
            <Text style={{ color: c.muted, fontSize: font.small, textAlign: 'center' }}>or pick hours and minutes</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Wheel values={HOURS} value={h} onChange={setH} unit="Hours" />
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '700', marginTop: space.lg }}>:</Text>
              <Wheel values={MINUTES} value={m} onChange={setM} unit="Minutes" />
            </View>

            <Text style={{ color: c.muted, fontSize: font.body, textAlign: 'center' }}>
              {total === 0 ? 'Less than a minute' : formatUrgeDuration(total)}
            </Text>

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={value === null ? 'Cancel' : 'Clear'}
                  variant="secondary"
                  onPress={() => {
                    if (value !== null) onChange(null);
                    close();
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Set"
                  icon="checkmark"
                  onPress={() => {
                    onChange(total);
                    close();
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
