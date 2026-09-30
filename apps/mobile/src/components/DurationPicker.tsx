import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { URGE_DURATION_OPTIONS, formatUrgeDuration } from '@journal/shared';
import { font, radius, space, useTheme } from '../lib/theme';
import { Button } from './ui';

const optionLabel = (m: number) => (m === 0 ? 'A few seconds (under 1 min)' : formatUrgeDuration(m));

/**
 * "How long did it last?" field: shows the chosen duration and opens a bottom-sheet
 * list of common durations, plus a custom number of minutes and a clear option.
 * Value is whole minutes (0 = seconds), or null when not recorded.
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
  const [custom, setCustom] = useState('');
  const isPreset = value !== null && (URGE_DURATION_OPTIONS as readonly number[]).includes(value);

  const choose = (m: number | null) => {
    onChange(m);
    setOpen(false);
  };
  const customMinutes = custom.trim() === '' ? null : Number(custom);
  const customValid = customMinutes !== null && Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= 1440;

  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value === null ? 'not set' : formatUrgeDuration(value)}. Change`}
        onPress={() => {
          setCustom(value !== null && !isPreset ? String(value) : '');
          setOpen(true);
        }}
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
          {value === null ? 'Tap to choose (optional)' : formatUrgeDuration(value)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={c.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              maxHeight: '80%',
              paddingBottom: space.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.md, paddingBottom: space.sm }}>
              <Text style={{ flex: 1, color: c.text, fontSize: font.title, fontWeight: '700' }}>
                How long did it last?
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={c.muted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.md, gap: 2 }}>
              {URGE_DURATION_OPTIONS.map((m) => {
                const on = value === m;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={optionLabel(m)}
                    onPress={() => choose(m)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      minHeight: 48,
                      paddingHorizontal: space.md,
                      borderRadius: radius.md,
                      backgroundColor: on ? c.primarySoft : pressed ? c.cardAlt : 'transparent',
                    })}
                  >
                    <Text style={{ flex: 1, fontSize: font.body, color: on ? c.primary : c.text, fontWeight: on ? '700' : '400' }}>
                      {optionLabel(m)}
                    </Text>
                    {on && <Ionicons name="checkmark" size={20} color={c.primary} />}
                  </Pressable>
                );
              })}

              <View style={{ marginTop: space.md, gap: space.sm }}>
                <Text style={{ color: c.text, fontSize: font.small, fontWeight: '600' }}>Other (minutes)</Text>
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                  <TextInput
                    accessibilityLabel="Other duration in minutes"
                    value={custom}
                    onChangeText={(t) => setCustom(t.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="e.g. 25"
                    placeholderTextColor={c.muted}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderWidth: 1,
                      borderRadius: radius.md,
                      paddingHorizontal: space.md,
                      fontSize: font.body,
                      color: c.text,
                      borderColor: c.border,
                      backgroundColor: c.cardAlt,
                    }}
                  />
                  <View style={{ minWidth: 96 }}>
                    <Button title="Use" disabled={!customValid} onPress={() => customValid && choose(customMinutes)} />
                  </View>
                </View>
                {custom !== '' && !customValid && (
                  <Text style={{ color: c.danger, fontSize: font.small }}>Enter 1 to 1440 minutes.</Text>
                )}
              </View>

              {value !== null && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choose(null)}
                  style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: space.sm }}
                >
                  <Text style={{ color: c.danger, fontSize: font.body, fontWeight: '600' }}>Clear duration</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
