import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { localDateSchema, toLocalDate, type PlanTaskRecord } from '@journal/shared';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { describeError } from '../../../api/client';
import { DateField, TimeField } from '../../../components/DateTimeFields';
import { identityLabel } from '../../../components/planner';
import { RepeatPicker } from '../../../components/RepeatPicker';
import { createSeries, deleteOccurrence, editOccurrence, repeatOf, type RepeatChoice, type Scope } from '../../../data/series';
import { Button, Card, Chip, ErrorNote, Field, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { createTask, deleteTask, getTask, listIdentities, updateTask, weekGoalsFor } from '../../../data/planner';
import { space } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

export default function TaskEditor() {
  const ctx = useCtx();
  const params = useLocalSearchParams<{ id?: string; date?: string; time?: string }>();
  const isNew = !params.id;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(params.date ?? toLocalDate());
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [time24, setTime24] = useState<string | null>(params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : null);
  const [place, setPlace] = useState('');
  const [twoMinute, setTwoMinute] = useState('');
  const [repeat, setRepeat] = useState<RepeatChoice | null>(null);
  const [original, setOriginal] = useState<PlanTaskRecord | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    void getTask(ctx, params.id).then(async (t) => {
      if (!t) return router.back();
      setOriginal(t);
      setRepeat((await repeatOf(ctx, t))?.choice ?? null);
      setTitle(t.title);
      setDate(t.localDate);
      setIdentityId(t.identityId);
      setGoalId(t.goalId);
      setTime24(t.localTime ? t.localTime.slice(0, 5) : null);
      setPlace(t.place ?? '');
      setTwoMinute(t.twoMinute ?? '');
      setLoaded(true);
    });
  }, [ctx, params.id]);

  const dateOk = localDateSchema.safeParse(date).success;
  const { data: options } = useQuery({
    queryKey: ['plan-task-options', dateOk ? date : ''],
    queryFn: async () => ({
      identities: await listIdentities(ctx),
      goals: dateOk ? await weekGoalsFor(ctx, date) : [],
    }),
  });

  if (!loaded || !options) return <Loading />;

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
    const draft = {
      title,
      localDate: date,
      identityId,
      goalId: options.goals.some((g) => g.id === goalId) ? goalId : null,
      localTime: time24,
      place: place.trim() || null,
      twoMinute: twoMinute.trim() || null,
    };
    const fields = { title, startTime: time24, endTime: null, color: null, identityId, place: draft.place, twoMinute: draft.twoMinute };
    if (isNew) return void run(() => (repeat ? createSeries(ctx, 'task', date, fields, repeat) : createTask(ctx, draft)));
    if (original?.seriesId) {
      const apply = (scope: Scope) => void run(() => editOccurrence(ctx, 'task', original, { date, fields, repeat }, scope));
      return Alert.alert('This task repeats', 'Change only this day, or this and the following ones?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This task', onPress: () => apply('one') },
        { text: 'This and following', onPress: () => apply('following') },
      ]);
    }
    // A one-off task that now repeats: the series takes its place from this day on.
    if (repeat)
      return void run(async () => {
        await deleteTask(ctx, params.id!);
        await createSeries(ctx, 'task', date, fields, repeat);
      });
    void run(() => updateTask(ctx, params.id!, draft));
  };

  const remove = () => {
    if (original?.seriesId) {
      const del = (scope: Scope) => void run(() => deleteOccurrence(ctx, original, 'task', scope));
      return Alert.alert('Delete a repeating task', title, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This task', style: 'destructive', onPress: () => del('one') },
        { text: 'This and following', style: 'destructive', onPress: () => del('following') },
      ]);
    }
    Alert.alert('Delete this task?', title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(() => deleteTask(ctx, params.id!)) },
    ]);
  };

  return (
    <Screen>
      <Card>
        <Field label="Task" value={title} onChangeText={setTitle} placeholder="e.g. Read 20 pages" maxLength={200} autoFocus={isNew} />
        <DateField label="Day" value={dateOk ? date : toLocalDate()} onChange={setDate} />
      </Card>

      <Card>
        <SectionTitle>Who does this make you?</SectionTitle>
        <Muted>Doing it is a vote for this identity.</Muted>
        {options.identities.length === 0 ? (
          <Muted style={{ fontStyle: 'italic' }}>No identities yet.</Muted>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {options.identities.map((i) => (
              <Chip key={i.id} label={identityLabel(i.statement)} selected={identityId === i.id} onPress={() => setIdentityId(identityId === i.id ? null : i.id)} />
            ))}
          </View>
        )}
        <Button title="Who I'm becoming" variant="ghost" icon="person-add-outline" onPress={() => router.push('/plan/identities')} />
        {options.goals.length > 0 && (
          <>
            <Muted>Moves this week's goal forward</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {options.goals.map((g) => (
                <Chip key={g.id} label={g.text} selected={goalId === g.id} onPress={() => setGoalId(goalId === g.id ? null : g.id)} />
              ))}
            </View>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Make it obvious</SectionTitle>
        <Muted>"I will [task] at [time] in [place]." You'll get a reminder at that time.</Muted>
        <TimeField label="Time (optional)" value={time24} onChange={setTime24} placeholder="No time set" clearable />
        <Field label="Place (optional)" value={place} onChangeText={setPlace} placeholder="e.g. Bedroom chair" maxLength={100} />
      </Card>

      <Card>
        <RepeatPicker date={date} value={repeat} onChange={setRepeat} />
      </Card>

      <Card>
        <SectionTitle>Make it easy</SectionTitle>
        <Field
          label="2-minute version (optional)"
          value={twoMinute}
          onChangeText={setTwoMinute}
          placeholder="e.g. Open the book"
          maxLength={200}
          hint="The tiny first step. On hard days, doing just this still counts."
        />
      </Card>

      {error && <ErrorNote message={error} />}
      <Button title={isNew ? 'Add task' : 'Save'} icon="checkmark" onPress={save} loading={busy} disabled={!title.trim() || !dateOk} />
      {!isNew && <Button title="Delete task" variant="danger" icon="trash-outline" onPress={remove} />}
    </Screen>
  );
}
