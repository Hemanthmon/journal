import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatLongDate, formatTime12, toLocalDate, toLocalTime } from '@journal/shared';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { font, radius, space, useTheme } from '../lib/theme';
import { Button } from './ui';

/** "YYYY-MM-DD" → local Date at noon (noon avoids DST edge cases). */
const fromDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day, 12);
};

/** "HH:MM" → today's Date at that time. */
const fromTime = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

function PickerButton({ label, text, icon, placeholder, onPress, onClear }: {
  label: string;
  text: string | null;
  icon: 'calendar-outline' | 'time-outline';
  placeholder?: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${text ?? placeholder ?? 'not set'}. Change`}
          onPress={onPress}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            minHeight: 48,
            paddingHorizontal: space.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.cardAlt,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name={icon} size={20} color={c.primary} />
          <Text style={{ color: text ? c.text : c.muted, fontSize: font.body, flex: 1 }}>{text ?? placeholder}</Text>
          <Ionicons name="chevron-down" size={18} color={c.muted} />
        </Pressable>
        {onClear && text && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} onPress={onClear}>
            <Ionicons name="close-circle" size={24} color={c.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Tap to pick from the system calendar / clock. Android opens the native dialog; iOS shows
 * the picker inline with a Done button.
 */
function usePicker(mode: 'date' | 'time') {
  const [iosOpen, setIosOpen] = useState(false);
  const open = (value: Date, onPick: (d: Date) => void, opts: { maximumDate?: Date; minimumDate?: Date } = {}) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: false,
        ...opts,
        onValueChange: (_e, d) => {
          if (d) onPick(d);
        },
      });
    } else {
      setIosOpen(true);
    }
  };
  return { open, iosOpen, closeIos: () => setIosOpen(false) };
}

export function DateField({
  label,
  value,
  onChange,
  maximumDate,
}: {
  label: string;
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (v: string) => void;
  /** "YYYY-MM-DD" */
  maximumDate?: string;
}) {
  const p = usePicker('date');
  const max = maximumDate ? fromDate(maximumDate) : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <PickerButton
        label={label}
        text={formatLongDate(value)}
        icon="calendar-outline"
        onPress={() => p.open(fromDate(value), (d) => onChange(toLocalDate(d)), { maximumDate: max })}
      />
      {p.iosOpen && (
        <>
          <DateTimePicker
            value={fromDate(value)}
            mode="date"
            display="inline"
            maximumDate={max}
            onValueChange={(_e, d) => d && onChange(toLocalDate(d))}
          />
          <Button title="Done" variant="secondary" onPress={p.closeIos} />
        </>
      )}
    </View>
  );
}

export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Pick a time',
  clearable,
}: {
  label: string;
  /** "HH:MM", or null when not set */
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const p = usePicker('time');
  const current = value ? fromTime(value) : (() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  })();
  return (
    <View style={{ gap: space.sm }}>
      <PickerButton
        label={label}
        text={value ? formatTime12(value) : null}
        placeholder={placeholder}
        icon="time-outline"
        onPress={() => {
          // iOS shows the wheel immediately with a value, so set one if empty.
          if (Platform.OS !== 'android' && !value) onChange(toLocalTime(current));
          p.open(current, (d) => onChange(toLocalTime(d)));
        }}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      {p.iosOpen && (
        <>
          <DateTimePicker value={current} mode="time" display="spinner" onValueChange={(_e, d) => d && onChange(toLocalTime(d))} />
          <Button title="Done" variant="secondary" onPress={p.closeIos} />
        </>
      )}
    </View>
  );
}
