import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { BLOCK_COLORS, toLocalDate, type BlockColor } from '@journal/shared';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { describeError } from '../../../api/client';
import { DateField, TimeField } from '../../../components/DateTimeFields';
import { blockColors } from '../../../components/Timeline';
import { identityLabel } from '../../../components/planner';
import { Button, Card, Chip, ErrorNote, Field, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { createBlock, deleteBlock, getBlock, minutesOf, timeOf, updateBlock } from '../../../data/blocks';
import { createSeries, deleteOccurrence, editOccurrence, repeatOf, type RepeatChoice, type Scope } from '../../../data/series';
import { RepeatPicker } from '../../../components/RepeatPicker';
import type { TimeBlockRecord } from '@journal/shared';
import { listIdentities } from '../../../data/planner';
import { font, radius, space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

const COLOR_NAMES: Record<BlockColor, string> = {
  sage: 'Sage',
  sky: 'Sky',
  lavender: 'Lavender',
  peach: 'Peach',
  rose: 'Rose',
  sand: 'Sand',
};

export default function BlockEditor() {
  const ctx = useCtx();
  const { c, dark } = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string; start?: string; end?: string }>();
  const isNew = !params.id;
  const startParam = Math.min(23 * 60, Math.max(0, Number(params.start ?? 9 * 60) || 9 * 60));

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(params.date ?? toLocalDate());
  const [start, setStart] = useState(timeOf(startParam));
  const endParam = Number(params.end);
  const [end, setEnd] = useState(timeOf(endParam > startParam ? Math.min(endParam, 23 * 60 + 59) : Math.min(startParam + 60, 23 * 60 + 59)));
  const [color, setColor] = useState<BlockColor>('sage');
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState<RepeatChoice | null>(null);
  const [original, setOriginal] = useState<TimeBlockRecord | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: identities } = useQuery({ queryKey: ['identities-active'], queryFn: () => listIdentities(ctx) });

  useEffect(() => {
    if (!params.id) return;
    void getBlock(ctx, params.id).then(async (b) => {
      if (!b) return router.back();
      setOriginal(b);
      setRepeat((await repeatOf(ctx, b))?.choice ?? null);
      setTitle(b.title);
      setDate(b.localDate);
      setStart(b.startTime.slice(0, 5));
      setEnd(b.endTime.slice(0, 5));
      setColor(b.color);
      setIdentityId(b.identityId);
      setNotes(b.notes ?? '');
      setLoaded(true);
    });
  }, [ctx, params.id]);

  if (!loaded || !identities) return <Loading />;

  const endOk = minutesOf(end) > minutesOf(start);

  // Moving the start keeps the block's length, like dragging an event.
  const changeStart = (v: string | null) => {
    if (!v) return;
    const len = Math.max(15, minutesOf(end) - minutesOf(start));
    setStart(v);
    setEnd(timeOf(Math.min(minutesOf(v) + len, 23 * 60 + 59)));
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const draft = { title, localDate: date, startTime: start, endTime: end, color, identityId, notes: notes.trim() || null };
    const fields = { title, startTime: start, endTime: end, color, identityId, notes: notes.trim() || null };
    if (isNew) return void run(() => (repeat ? createSeries(ctx, 'block', date, fields, repeat) : createBlock(ctx, draft)));
    if (original?.seriesId) {
      const apply = (scope: Scope) => void run(() => editOccurrence(ctx, 'block', original, { date, fields, repeat }, scope));
      return Alert.alert('This block repeats', 'Change only this day, or this and the following ones?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This block', onPress: () => apply('one') },
        { text: 'This and following', onPress: () => apply('following') },
      ]);
    }
    // A one-off block that now repeats: the series takes its place from this day on.
    if (repeat)
      return void run(async () => {
        await deleteBlock(ctx, params.id!);
        await createSeries(ctx, 'block', date, fields, repeat);
      });
    void run(() => updateBlock(ctx, params.id!, draft));
  };

  const remove = () => {
    if (original?.seriesId) {
      const del = (scope: Scope) => void run(() => deleteOccurrence(ctx, original, 'block', scope));
      return Alert.alert('Delete a repeating block', title, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This block', style: 'destructive', onPress: () => del('one') },
        { text: 'This and following', style: 'destructive', onPress: () => del('following') },
      ]);
    }
    Alert.alert('Delete this block?', title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(() => deleteBlock(ctx, params.id!)) },
    ]);
  };

  return (
    <Screen>
      <Card>
        <Field label="Block" value={title} onChangeText={setTitle} placeholder="e.g. Deep work" maxLength={200} autoFocus={isNew} />
        <DateField label="Day" value={date} onChange={setDate} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <TimeField label="Starts" value={start} onChange={changeStart} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label="Ends" value={end} onChange={(v) => v && setEnd(v)} />
          </View>
        </View>
        {!endOk && <ErrorNote message="The block must end after it starts." />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[30, 60, 90, 120].map((m) => (
            <Chip
              key={m}
              label={m < 60 ? `${m} min` : `${m / 60} h`}
              selected={endOk && minutesOf(end) - minutesOf(start) === m}
              onPress={() => setEnd(timeOf(Math.min(minutesOf(start) + m, 23 * 60 + 59)))}
            />
          ))}
        </View>
      </Card>

      <Card>
        <RepeatPicker date={date} value={repeat} onChange={setRepeat} />
      </Card>

      <Card>
        <SectionTitle>Colour</SectionTitle>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {BLOCK_COLORS.map((k) => {
            const col = blockColors(k, dark);
            const on = color === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={COLOR_NAMES[k]}
                onPress={() => setColor(k)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.xs,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  backgroundColor: col.bg,
                  borderWidth: 2,
                  borderColor: on ? col.accent : 'transparent',
                }}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: col.accent }} />
                <Text style={{ color: col.text, fontSize: font.small, fontWeight: on ? '700' : '500' }}>{COLOR_NAMES[k]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {identities.length > 0 && (
        <Card>
          <SectionTitle>Who is this time for?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {identities.map((i) => (
              <Chip key={i.id} label={identityLabel(i.statement)} selected={identityId === i.id} onPress={() => setIdentityId(identityId === i.id ? null : i.id)} />
            ))}
          </View>
        </Card>
      )}

      <Card>
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
        <Muted style={{ color: c.muted }}>When Google Calendar is connected, blocks appear there too.</Muted>
      </Card>

      {error && <ErrorNote message={error} />}
      <Button title={isNew ? 'Add block' : 'Save'} icon="checkmark" onPress={save} loading={busy} disabled={!title.trim() || !endOk} />
      {!isNew && <Button title="Delete block" variant="danger" icon="trash-outline" onPress={remove} />}
    </Screen>
  );
}
