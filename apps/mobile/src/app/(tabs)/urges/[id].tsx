import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { localDateSchema, toLocalDate, toLocalTime } from '@journal/shared';
import { describeError } from '../../../api/client';
import { Body, Button, Card, Chip, ErrorNote, Field, Loading, Muted, Screen, Segmented } from '../../../components/ui';
import { DateField, TimeField } from '../../../components/DateTimeFields';
import { DurationPicker } from '../../../components/DurationPicker';
import { createUrge, deleteUrge, getUrge, updateUrge, type UrgeDraft } from '../../../data/urges';
import { listEmotions } from '../../../data/emotions';
import { EMOTION_MAX_LENGTH, formatEmotions, parseEmotions } from '../../../lib/emotions';
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
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const isNew = id === 'new';
  const existing = useQuery({
    queryKey: ['urge', id],
    queryFn: () => getUrge(ctx, id),
    enabled: !isNew,
  });
  // The user's own emotion chips (Profile → Manage emotions).
  const emotionList = useQuery({ queryKey: ['emotions'], queryFn: () => listEmotions(ctx) });
  const emotionOptions = emotionList.data?.map((e) => e.name) ?? [];
  const loadedRecord = useRef(false);

  const now = new Date();
  const [date, setDate] = useState(toLocalDate(now));
  // Picked from the system clock; stored as 24-hour "HH:MM".
  const [time24, setTime24] = useState(toLocalTime(now));
  const [intensity, setIntensity] = useState<number | null>(null);
  const [trigger, setTrigger] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [otherEmotion, setOtherEmotion] = useState('');
  const [action, setAction] = useState(isNew && from === 'breathing' ? 'Did a 2-minute breathing exercise' : '');
  const [outcome, setOutcome] = useState('');
  const [masturbated, setMasturbated] = useState<YesNo>('unset');
  const [explicit, setExplicit] = useState<YesNo>('unset');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = existing.data;
    // Fill the form once, when both the record and the emotion list are available.
    if (!u || !emotionList.data || loadedRecord.current) return;
    loadedRecord.current = true;
    setDate(u.localDate);
    setTime24(u.localTime.slice(0, 5));
    setIntensity(u.intensity);
    setTrigger(u.triggerText ?? '');
    setDuration(u.durationMinutes ?? null);
    const parsed = parseEmotions(u.emotionBefore, emotionList.data.map((e) => e.name));
    setEmotions(parsed.selected);
    setOtherEmotion(parsed.other);
    setAction(u.actionTaken ?? '');
    setOutcome(u.outcome ?? '');
    setMasturbated(toYesNo(u.masturbated));
    setExplicit(toYesNo(u.explicitContent));
    setRemarks(u.remarks ?? '');
  }, [existing.data, emotionList.data]);

  if ((!isNew && existing.isLoading) || emotionList.isLoading) return <Loading />;

  const dateOk = localDateSchema.safeParse(date).success;

  const save = async () => {
    setError(null);
    if (intensity === null) return setError('Choose an intensity from 0 to 10.');
    if (!dateOk) return setError('Pick the date.');
    const draft: UrgeDraft = {
      localDate: date,
      localTime: time24,
      intensity,
      durationMinutes: duration,
      triggerText: trigger,
      emotionBefore: formatEmotions(emotions, otherEmotion, emotionOptions),
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
        <DateField label="Date" value={dateOk ? date : toLocalDate()} onChange={setDate} maximumDate={toLocalDate()} />
        <TimeField label="Time" value={time24} onChange={(v) => v && setTime24(v)} />
        {isNew && (
          <Button
            title="Set to now"
            variant="ghost"
            icon="time-outline"
            onPress={() => {
              const n = new Date();
              setDate(toLocalDate(n));
              setTime24(toLocalTime(n));
            }}
          />
        )}
      </Card>

      <Card>
        <Field label="Trigger" value={trigger} onChangeText={setTrigger} placeholder="What set it off?" />
        <DurationPicker label="How long did the urge last?" value={duration} onChange={setDuration} />
        <Body style={{ fontWeight: '600' }}>Emotion felt before the urge</Body>
        <Muted>Tap all that apply. Edit this list in Profile → Manage emotions.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {emotionOptions.map((e) => {
            const on = emotions.includes(e);
            return (
              <Chip
                key={e}
                label={e}
                selected={on}
                onPress={() => setEmotions((cur) => (on ? cur.filter((x) => x !== e) : [...cur, e]))}
              />
            );
          })}
        </View>
        <Field
          label="Other (optional)"
          value={otherEmotion}
          onChangeText={setOtherEmotion}
          placeholder="Anything else you felt"
          maxLength={EMOTION_MAX_LENGTH - 40}
        />
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
