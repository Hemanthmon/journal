import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { localDateSchema, toLocalDate } from '@journal/shared';
import { SessionBanner } from '../../components/SessionBanner';
import { Body, Card, EmptyState, ErrorNote, Loading, Muted, Screen, SectionTitle } from '../../components/ui';
import { DateNavigator, EmojiPicker, HabitInput } from '../../components/widgets';
import { habitsForDate, setHabitValue, type HabitForDay } from '../../data/habits';
import { getJournalDay, journalCompletion, saveAnswer, type DayQuestion } from '../../data/journal';
import type { Ctx } from '../../data/records';
import { useAutosave } from '../../hooks/useAutosave';
import type { SaveStatus } from '../../lib/autosave';
import { font, radius, space, useTheme } from '../../lib/theme';
import { useCtx } from '../../state/session';
import { describeError } from '../../api/client';

function SaveBadge({ status }: { status: SaveStatus }) {
  const { c } = useTheme();
  const label =
    status === 'pending' || status === 'saving'
      ? 'Saving…'
      : status === 'error'
        ? 'Not saved — will retry'
        : status === 'saved'
          ? 'Saved'
          : '';
  if (!label) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons
        name={status === 'saved' ? 'checkmark-circle-outline' : status === 'error' ? 'alert-circle-outline' : 'time-outline'}
        size={14}
        color={status === 'error' ? c.danger : c.muted}
      />
      <Text style={{ color: status === 'error' ? c.danger : c.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function TextQuestion({ ctx, date, q }: { ctx: Ctx; date: string; q: DayQuestion }) {
  const { c } = useTheme();
  const { text, setText, status, flush } = useAutosave(q.answer?.textValue ?? '', async (value) => {
    await saveAnswer(ctx, date, { id: q.questionId, text: q.text, type: 'text' }, { textValue: value });
  });
  return (
    <Card>
      <SectionTitle right={<SaveBadge status={status} />}>{q.text}</SectionTitle>
      {q.isRequired && <Muted>Required</Muted>}
      <TextInput
        accessibilityLabel={q.text}
        value={text}
        onChangeText={setText}
        onBlur={() => void flush()}
        multiline
        placeholder="Write as much or as little as you like…"
        placeholderTextColor={c.muted}
        textAlignVertical="top"
        scrollEnabled={false}
        style={{
          minHeight: 140,
          color: c.text,
          fontSize: font.body,
          lineHeight: 24,
          backgroundColor: c.cardAlt,
          borderRadius: radius.md,
          padding: space.md,
        }}
      />
    </Card>
  );
}

function EmojiQuestion({ ctx, date, q }: { ctx: Ctx; date: string; q: DayQuestion }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<number | null>(q.answer?.emojiValue ?? null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <SectionTitle>{q.text}</SectionTitle>
      <EmojiPicker
        label={q.text}
        value={value}
        onChange={async (v) => {
          setValue(v);
          try {
            await saveAnswer(ctx, date, { id: q.questionId, text: q.text, type: 'emoji' }, { emojiValue: v });
            void qc.invalidateQueries({ queryKey: ['dashboard'] });
          } catch (e) {
            setError(describeError(e));
          }
        }}
      />
      {q.isRequired ? <Muted>Required</Muted> : <Muted>Optional — tap again to clear.</Muted>}
      {error && <ErrorNote message={error} />}
    </Card>
  );
}

function HabitsSection({ ctx, date, habits }: { ctx: Ctx; date: string; habits: HabitForDay[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const completed = habits.filter((h) => h.progress >= 100).length;

  const change = async (h: HabitForDay, v: number) => {
    setError(null);
    // Optimistic update so steppers feel instant; SQLite write follows immediately.
    qc.setQueryData<HabitForDay[]>(['habitsForDate', date], (old) =>
      old?.map((x) => (x.habit.id === h.habit.id ? { ...x, value: v } : x)),
    );
    try {
      await setHabitValue(ctx, h.habit, date, v);
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <Card>
      <SectionTitle right={habits.length ? <Muted>{`${completed}/${habits.length} done`}</Muted> : undefined}>
        Daily habits
      </SectionTitle>
      {habits.length === 0 ? (
        <EmptyState
          icon="leaf-outline"
          title="Nothing scheduled for this day"
          message="Manage habits in Profile → Daily Routine Settings."
        />
      ) : (
        <View style={{ gap: space.lg }}>
          {habits.map((h) => (
            <HabitInput
              key={h.habit.id}
              name={h.habit.name}
              type={h.type}
              value={h.value}
              target={h.target}
              unit={h.unit}
              progress={h.progress}
              onChange={(v) => void change(h, v)}
            />
          ))}
        </View>
      )}
      {error && <ErrorNote message={error} />}
    </Card>
  );
}

export default function Routine() {
  const ctx = useCtx();
  const params = useLocalSearchParams<{ date?: string }>();
  const initial = params.date && localDateSchema.safeParse(params.date).success ? params.date : toLocalDate();
  const [date, setDate] = useState(initial);
  useEffect(() => {
    if (params.date && localDateSchema.safeParse(params.date).success) setDate(params.date);
  }, [params.date]);

  const habits = useQuery({ queryKey: ['habitsForDate', date], queryFn: () => habitsForDate(ctx, date) });
  const journal = useQuery({ queryKey: ['journalDay', date], queryFn: () => getJournalDay(ctx, date) });

  const changeDate = (d: string) => {
    setDate(d);
    router.setParams({ date: d });
  };

  const completion = journal.data ? journalCompletion(journal.data) : null;

  return (
    <Screen>
      <SessionBanner />
      <DateNavigator date={date} onChange={changeDate} />
      {habits.isLoading || journal.isLoading || !habits.data || !journal.data ? (
        <Loading />
      ) : (
        <>
          <HabitsSection ctx={ctx} date={date} habits={habits.data} />
          {completion && completion.requiredMissing > 0 && (
            <Muted>
              {completion.requiredMissing} required question{completion.requiredMissing === 1 ? '' : 's'} not answered yet
              — you can come back to {completion.requiredMissing === 1 ? 'it' : 'them'} any time.
            </Muted>
          )}
          {journal.data.questions.length === 0 ? (
            <Card>
              <EmptyState icon="chatbubble-ellipses-outline" title="No reflection questions" message="Add questions in Profile → Manage questions." />
            </Card>
          ) : (
            // Keyed by date so each day's fields start from that day's saved answers.
            journal.data.questions.map((q) =>
              q.type === 'emoji' ? (
                <EmojiQuestion key={`${date}:${q.questionId}`} ctx={ctx} date={date} q={q} />
              ) : (
                <TextQuestion key={`${date}:${q.questionId}`} ctx={ctx} date={date} q={q} />
              ),
            )
          )}
          <Body style={{ textAlign: 'center' }}>
            <Muted>Everything saves automatically on this device.</Muted>
          </Body>
        </>
      )}
    </Screen>
  );
}
