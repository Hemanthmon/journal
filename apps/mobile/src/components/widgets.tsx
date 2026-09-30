import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  MOOD_OPTIONS,
  addDays,
  formatLongDate,
  formatShortDate,
  toLocalDate,
  weekdayName,
  weekdayOf,
  type MeasurementType,
} from '@journal/shared';
import { font, radius, space, useTheme } from '../lib/theme';
import { useSyncStore } from '../state/sync';
import { Body, IconButton, Muted, ProgressBar } from './ui';

/** Five-emoji mood scale. Tapping the selected emoji clears it (the question is optional). */
export function EmojiPicker({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={wStyles.emojiRow}>
      {MOOD_OPTIONS.map((m) => {
        const selected = value === m.value;
        return (
          <Pressable
            key={m.value}
            accessibilityRole="radio"
            accessibilityLabel={m.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : m.value)}
            style={[
              wStyles.emoji,
              { backgroundColor: selected ? c.primarySoft : 'transparent', borderColor: selected ? c.primary : c.border },
            ]}
          >
            <Text style={{ fontSize: 28 }}>{m.emoji}</Text>
            <Text style={{ fontSize: 11, color: selected ? c.primary : c.muted }} numberOfLines={1}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Previous/next day navigation with a jump back to today. */
export function DateNavigator({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const { c } = useTheme();
  const today = toLocalDate();
  const isToday = date === today;
  return (
    <View style={wStyles.dateNav}>
      <IconButton icon="chevron-back" label="Previous day" onPress={() => onChange(addDays(date, -1))} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: font.large, fontWeight: '700' }}>
          {isToday ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : formatShortDate(date)}
        </Text>
        <Muted>{formatLongDate(date)}</Muted>
      </View>
      {isToday ? (
        <IconButton icon="chevron-forward" label="Next day" disabled onPress={() => undefined} />
      ) : (
        <IconButton icon="chevron-forward" label="Next day" onPress={() => onChange(addDays(date, 1))} />
      )}
      {!isToday && (
        <Pressable accessibilityRole="button" accessibilityLabel="Go to today" onPress={() => onChange(today)} hitSlop={8}>
          <Text style={{ color: c.primary, fontWeight: '600' }}>Today</Text>
        </Pressable>
      )}
    </View>
  );
}

function formatValue(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Input for one habit on one day, by measurement type:
 *   boolean  checkbox
 *   duration − [ n minutes ] +   (steps of 5)
 *   count    − [ n ] +           (editable, steps of 1)
 *   quantity [ n ] unit          (editable, steps of 0.25)
 */
export function HabitInput({
  name,
  type,
  value,
  target,
  unit,
  progress,
  onChange,
}: {
  name: string;
  type: MeasurementType;
  value: number;
  target: number;
  unit: string | null;
  progress: number;
  onChange: (v: number) => void;
}) {
  const { c } = useTheme();
  const [text, setText] = useState(formatValue(value));
  useEffect(() => setText(formatValue(value)), [value]);

  if (type === 'boolean') {
    const done = value >= 1;
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={name}
        accessibilityState={{ checked: done }}
        onPress={() => onChange(done ? 0 : 1)}
        style={wStyles.habitRow}
      >
        <Ionicons name={done ? 'checkbox' : 'square-outline'} size={28} color={done ? c.success : c.muted} />
        <Body style={{ flex: 1 }}>{name}</Body>
        <Muted>{done ? 'Done' : ''}</Muted>
      </Pressable>
    );
  }

  const step = type === 'duration' ? 5 : type === 'count' ? 1 : 0.25;
  const unitLabel = unit ?? (type === 'count' ? '' : '');
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) onChange(n);
    else setText(formatValue(value));
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={wStyles.habitRow}>
        <Body style={{ flex: 1 }}>{name}</Body>
        <Muted>
          {formatValue(value)} / {formatValue(target)} {unitLabel}
        </Muted>
      </View>
      <View style={wStyles.stepper}>
        <IconButton
          icon="remove-circle-outline"
          label={`Decrease ${name}`}
          onPress={() => onChange(Math.max(0, value - step))}
          disabled={value <= 0}
        />
        <TextInput
          accessibilityLabel={`${name} amount${unitLabel ? ` in ${unitLabel}` : ''}`}
          value={text}
          onChangeText={setText}
          onEndEditing={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          style={[wStyles.stepInput, { color: c.text, backgroundColor: c.cardAlt, borderColor: c.border }]}
        />
        {unitLabel ? <Muted style={{ minWidth: 50 }}>{unitLabel}</Muted> : null}
        <IconButton icon="add-circle-outline" label={`Increase ${name}`} onPress={() => onChange(value + step)} />
      </View>
      <ProgressBar percent={progress} label={`${name} progress`} />
    </View>
  );
}

/** Small vertical bars, e.g. habit completion for the last 7 days. `null` shows as a dash. */
export function MiniBars({
  data,
  max = 100,
  height = 64,
  label,
}: {
  data: { key: string; label: string; value: number | null; caption?: string }[];
  max?: number;
  height?: number;
  label: string;
}) {
  const { c } = useTheme();
  const summary = data.map((d) => `${d.label}: ${d.value === null ? 'none' : Math.round(d.value)}`).join(', ');
  return (
    <View accessible accessibilityLabel={`${label}. ${summary}`} style={wStyles.bars}>
      {data.map((d) => {
        const h = d.value === null ? 0 : Math.max(3, (Math.min(d.value, max) / max) * height);
        return (
          <View key={d.key} style={wStyles.barCol}>
            <View style={{ height, justifyContent: 'flex-end' }}>
              {d.value === null ? (
                <Text style={{ color: c.muted, textAlign: 'center' }}>–</Text>
              ) : (
                <View style={{ height: h, width: 18, borderRadius: 6, backgroundColor: c.primary }} />
              )}
            </View>
            {d.caption !== undefined && <Text style={{ fontSize: 12, color: c.text }}>{d.caption}</Text>}
            <Text style={{ fontSize: 11, color: c.muted }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const shortDay = (localDate: string) => weekdayName(weekdayOf(localDate)).slice(0, 2);

/** Compact sync status shown in the header. */
export function SyncIndicator({ onPress }: { onPress?: () => void }) {
  const { c } = useTheme();
  const s = useSyncStore((st) => st.state);
  let icon: 'cloud-done-outline' | 'sync-outline' | 'cloud-offline-outline' | 'alert-circle-outline' = 'cloud-done-outline';
  let text = 'Synced';
  let color = c.success;
  if (s.phase === 'syncing') {
    icon = 'sync-outline';
    text = 'Syncing';
    color = c.primary;
  } else if (s.phase === 'offline') {
    icon = 'cloud-offline-outline';
    text = 'Offline';
    color = c.muted;
  } else if (s.phase === 'error' || s.conflicts > 0) {
    icon = 'alert-circle-outline';
    text = s.conflicts > 0 ? 'Needs attention' : 'Sync failed';
    color = c.warning;
  } else if (s.pending > 0) {
    icon = 'sync-outline';
    text = 'Waiting';
    color = c.muted;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${text}${s.pending ? `, ${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : ''}`}
      onPress={onPress}
      hitSlop={8}
      style={wStyles.sync}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}

const wStyles = StyleSheet.create({
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  emoji: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 64,
    gap: 2,
  },
  dateNav: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepInput: {
    minWidth: 72,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    textAlign: 'center',
    fontSize: font.large,
    fontWeight: '600',
    paddingHorizontal: space.sm,
  },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, minHeight: 44 },
});
