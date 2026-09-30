import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { ALL_WEEKDAYS, MEASUREMENT_LABELS, MEASUREMENT_TYPES, weekdayName, type MeasurementType } from '@journal/shared';
import { describeError } from '../../../../api/client';
import { Body, Button, Card, Chip, ErrorNote, Field, Loading, Muted, Screen, Segmented, ToggleRow } from '../../../../components/ui';
import { createHabit, deleteHabit, getHabit, updateHabit } from '../../../../data/habits';
import { space } from '../../../../lib/theme';
import { useCtx } from '../../../../state/session';

const PRESETS = [
  { label: 'Every day', days: ALL_WEEKDAYS as number[] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Mon–Sat', days: [1, 2, 3, 4, 5, 6] },
  { label: 'Weekends', days: [6, 7] },
];

export default function HabitEditor() {
  const ctx = useCtx();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useQuery({ queryKey: ['habit', id], queryFn: () => getHabit(ctx, id), enabled: !isNew });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<MeasurementType>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [days, setDays] = useState<number[]>(ALL_WEEKDAYS);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = existing.data;
    if (!h) return;
    setName(h.name);
    setDescription(h.description ?? '');
    setType(h.measurementType);
    setTarget(String(h.targetValue));
    setUnit(h.unit ?? '');
    setDays(h.scheduleDays);
    setActive(h.isActive);
  }, [existing.data]);

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && !existing.data) return <Screen><Body>This habit no longer exists.</Body></Screen>;

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  const save = async () => {
    setError(null);
    const targetNum = type === 'boolean' ? 1 : Number(target.replace(',', '.'));
    if (type !== 'boolean' && !(targetNum > 0)) return setError('Enter a target greater than 0.');
    const draft = {
      name,
      description: description || null,
      measurementType: type,
      targetValue: targetNum,
      unit: type === 'duration' ? 'minutes' : unit || null,
      scheduleDays: days,
      isActive: active,
    };
    setSaving(true);
    try {
      if (isNew) await createHabit(ctx, draft);
      else await updateHabit(ctx, id, draft);
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const archived = !!existing.data?.archivedAt;

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New habit' : 'Edit habit' }} />
      <Card>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Meditation" />
        <Field label="Description (optional)" value={description} onChangeText={setDescription} />
      </Card>

      <Card>
        <Body style={{ fontWeight: '600' }}>How do you measure it?</Body>
        <Segmented
          options={MEASUREMENT_TYPES.map((t) => ({ value: t, label: MEASUREMENT_LABELS[t] }))}
          value={type}
          onChange={setType}
        />
        {type === 'boolean' ? (
          <Muted>Done or not done — shown as a checkbox.</Muted>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                label={type === 'duration' ? 'Daily target (minutes)' : 'Daily target'}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder={type === 'duration' ? '30' : type === 'count' ? '10' : '2'}
              />
            </View>
            {type !== 'duration' && (
              <View style={{ flex: 1 }}>
                <Field
                  label={type === 'quantity' ? 'Unit' : 'Unit (optional)'}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder={type === 'quantity' ? 'litres' : 'pages'}
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>
        )}
        {!isNew && <Muted>Changing the target only affects future days. Past progress keeps its original target.</Muted>}
      </Card>

      <Card>
        <Body style={{ fontWeight: '600' }}>Which days?</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PRESETS.map((p) => (
            <Chip key={p.label} label={p.label} selected={days.join() === p.days.join()} onPress={() => setDays(p.days)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ALL_WEEKDAYS.map((d) => (
            <Chip
              key={d}
              label={weekdayName(d)}
              accessibilityLabel={weekdayName(d, 'long')}
              selected={days.includes(d)}
              onPress={() => toggleDay(d)}
            />
          ))}
        </View>
        <Muted>The habit only appears on these days. Other days never count against you.</Muted>
      </Card>

      <Card>
        <ToggleRow label="Enabled" hint="Turn off to pause this habit without archiving it." value={active} onChange={setActive} />
      </Card>

      {error && <ErrorNote message={error} />}
      <Button title="Save" icon="checkmark" onPress={save} loading={saving} disabled={!name.trim() || days.length === 0} />

      {!isNew && (
        <>
          <Button
            title={archived ? 'Restore from archive' : 'Archive'}
            variant="secondary"
            icon="archive-outline"
            onPress={async () => {
              await updateHabit(ctx, id, { archived: !archived });
              router.back();
            }}
          />
          <Button
            title="Delete habit"
            variant="danger"
            icon="trash-outline"
            onPress={() =>
              Alert.alert('Delete this habit?', 'It will be removed from your routine. Your past progress stays in your history and exports.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteHabit(ctx, id);
                    router.back();
                  },
                },
              ])
            }
          />
        </>
      )}
    </Screen>
  );
}
