import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  localDateSchema,
  localTimeSchema,
  toLocalDate,
  toLocalTime,
  weekdayName,
  weekdayOf,
} from '@journal/shared';
import { describeError } from '../../../api/client';
import { Body, Button, Card, Chip, ErrorNote, Field, Loading, Muted, Screen, Segmented } from '../../../components/ui';
import { createUrge, deleteUrge, getUrge, updateUrge, type UrgeDraft } from '../../../data/urges';
import { space } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

type YesNo = 'yes' | 'no' | 'unset';
const toYesNo = (v: boolean | null | undefined): YesNo => (v === true ? 'yes' : v === false ? 'no' : 'unset');
const fromYesNo = (v: YesNo) => (v === 'yes' ? true : v === 'no' ? false : null);
const YES_NO = [
  { value: 'no' as const, label: 'No' },
  { value: 'yes' as const, label: 'Yes' },
  { value: 'unset' as const, label: 'Skip' },
];

export default function UrgeForm() {
  const ctx = useCtx();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useQuery({
    queryKey: ['urge', id],
    queryFn: () => getUrge(ctx, id),
    enabled: !isNew,
  });

  const now = new Date();
  const [date, setDate] = useState(toLocalDate(now));
  const [time, setTime] = useState(toLocalTime(now));
  const [intensity, setIntensity] = useState<number | null>(null);
  const [trigger, setTrigger] = useState('');
  const [emotion, setEmotion] = useState('');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [masturbated, setMasturbated] = useState<YesNo>('unset');
  const [explicit, setExplicit] = useState<YesNo>('unset');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = existing.data;
    if (!u) return;
    setDate(u.localDate);
    setTime(u.localTime.slice(0, 5));
    setIntensity(u.intensity);
    setTrigger(u.triggerText ?? '');
    setEmotion(u.emotionBefore ?? '');
    setAction(u.actionTaken ?? '');
    setOutcome(u.outcome ?? '');
    setMasturbated(toYesNo(u.masturbated));
    setExplicit(toYesNo(u.explicitContent));
    setRemarks(u.remarks ?? '');
  }, [existing.data]);

  if (!isNew && existing.isLoading) return <Loading />;

  const dateOk = localDateSchema.safeParse(date).success;
  const timeOk = localTimeSchema.safeParse(time).success;

  const save = async () => {
    setError(null);
    if (intensity === null) return setError('Choose an intensity from 0 to 10.');
    if (!dateOk || !timeOk) return setError('Check the date (YYYY-MM-DD) and time (HH:MM).');
    const draft: UrgeDraft = {
      localDate: date,
      localTime: time,
      intensity,
      triggerText: trigger,
      emotionBefore: emotion,
      actionTaken: action,
      outcome,
      masturbated: fromYesNo(masturbated),
      explicitContent: fromYesNo(explicit),
      remarks,
    };
    setSaving(true);
    try {
      if (isNew) await createUrge(ctx, draft);
      else await updateUrge(ctx, id, draft);
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this record?', 'This removes it from all your devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteUrge(ctx, id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'Record an urge' : 'Edit urge' }} />

      <Card>
        <Body style={{ fontWeight: '600' }}>Intensity (0–10)</Body>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Array.from({ length: 11 }, (_, i) => (
            <Chip
              key={i}
              label={String(i)}
              accessibilityLabel={`Intensity ${i}`}
              selected={intensity === i}
              onPress={() => setIntensity(i)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={dateOk ? null : 'Use YYYY-MM-DD'} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" error={timeOk ? null : 'Use HH:MM'} />
          </View>
        </View>
        <Muted>{dateOk ? `Day: ${weekdayName(weekdayOf(date), 'long')}` : ' '}</Muted>
        {isNew && (
          <Button
            title="Set to now"
            variant="ghost"
            icon="time-outline"
            onPress={() => {
              const n = new Date();
              setDate(toLocalDate(n));
              setTime(toLocalTime(n));
            }}
          />
        )}
      </Card>

      <Card>
        <Field label="Trigger" value={trigger} onChangeText={setTrigger} placeholder="What set it off?" />
        <Field label="Emotion felt before the urge" value={emotion} onChangeText={setEmotion} placeholder="e.g. bored, lonely, stressed" />
        <Field label="What did I do?" value={action} onChangeText={setAction} multiline />
        <Field label="What happened after the urge?" value={outcome} onChangeText={setOutcome} multiline />
      </Card>

      <Card>
        <Body style={{ fontWeight: '600' }}>Did I masturbate?</Body>
        <Segmented options={YES_NO} value={masturbated} onChange={setMasturbated} />
        <Body style={{ fontWeight: '600' }}>Did I watch explicit content?</Body>
        <Segmented options={YES_NO} value={explicit} onChange={setExplicit} />
      </Card>

      <Card>
        <Field label="Remarks" value={remarks} onChangeText={setRemarks} multiline />
      </Card>

      {error && <ErrorNote message={error} />}
      <Button title={isNew ? 'Save' : 'Save changes'} icon="checkmark" onPress={save} loading={saving} />
      {!isNew && <Button title="Delete record" variant="danger" icon="trash-outline" onPress={remove} />}
    </Screen>
  );
}
