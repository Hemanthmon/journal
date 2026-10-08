import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { addDays, formatLongDate, toLocalDate, weekdayName, weekdayOf, type IdentityRecord, type PlanGoalRecord, type PlanLevel } from '@journal/shared';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { describeError } from '../../../api/client';
import { PeriodNav, Tally, TaskRow, VotesList, identityLabel, monthLabel, weekLabel } from '../../../components/planner';
import { Timeline } from '../../../components/Timeline';
import { timelineFor } from '../../../data/blocks';
import { Body, Button, Card, Chip, EmptyState, ErrorNote, Field, Loading, Muted, ProgressBar, Screen, SectionTitle, Segmented } from '../../../components/ui';
import {
  carryOver,
  createGoal,
  deleteGoal,
  identityVotes,
  listGoals,
  listIdentities,
  loadPeriod,
  missedYesterday,
  monthStartOf,
  shiftPeriod,
  tasksForDate,
  toggleGoalDone,
  toggleTask,
  weekStartOf,
} from '../../../data/planner';
import { font, radius, space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

type View_ = 'day' | 'week' | 'month';

export default function Plan() {
  const [view, setView] = useState<View_>('day');
  const [today, setToday] = useState(toLocalDate());
  const [date, setDate] = useState(today);
  // A new day while the app stayed open: jump to it.
  useFocusEffect(
    useCallback(() => {
      const t = toLocalDate();
      if (t !== today) {
        setToday(t);
        setDate(t);
      }
    }, [today]),
  );

  return (
    <Screen>
      <Segmented
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'day' && <DayView date={date} today={today} setDate={setDate} />}
      {view === 'week' && (
        <WeekView
          weekStart={weekStartOf(date)}
          today={today}
          setDate={setDate}
          openDay={(d) => {
            setDate(d);
            setView('day');
          }}
        />
      )}
      {view === 'month' && (
        <MonthView
          monthStart={monthStartOf(date)}
          today={today}
          setDate={setDate}
          openDay={(d) => {
            setDate(d);
            setView('day');
          }}
        />
      )}
    </Screen>
  );
}

const byId = (identities: IdentityRecord[] | undefined) => new Map((identities ?? []).map((i) => [i.id, i]));

// ------------------------------------------------------------------ day

function DayView({ date, today, setDate }: { date: string; today: string; setDate: (d: string) => void }) {
  const ctx = useCtx();
  const { c } = useTheme();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'timeline' | 'list'>('timeline');
  const weekStart = weekStartOf(date);
  const { data, isLoading } = useQuery({
    queryKey: ['plan-day', date, today],
    queryFn: async () => {
      const [tasks, identities, missed, votes, timeline] = await Promise.all([
        tasksForDate(ctx, date),
        listIdentities(ctx, { includeArchived: true }),
        date === today ? missedYesterday(ctx, today) : Promise.resolve([]),
        identityVotes(ctx, weekStart, addDays(weekStart, 6)),
        timelineFor(ctx, date),
      ]);
      return { tasks, identities, missed, votes, timeline };
    },
  });
  if (isLoading || !data) return <Loading />;
  const ids = byId(data.identities);
  const done = data.tasks.filter((t) => t.completedAt).length;

  const toggle = async (id: string) => {
    setError(null);
    try {
      const t = await toggleTask(ctx, id);
      const who = t.identityId ? ids.get(t.identityId) : undefined;
      setNotice(t.completedAt ? (who ? `+1 vote for "${who.statement}" 🌱` : 'Nice. Done! 🌱') : null);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const label = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : formatLongDate(date);

  return (
    <>
      <PeriodNav
        label={label}
        onPrev={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1))}
        onToday={date !== today ? () => setDate(today) : undefined}
      />
      {label !== formatLongDate(date) && <Muted style={{ textAlign: 'center', marginTop: -space.sm }}>{formatLongDate(date)}</Muted>}

      {data.missed.length > 0 && (
        <Card style={{ borderWidth: 1, borderColor: c.warning }}>
          <SectionTitle>Never miss twice</SectionTitle>
          <Muted>Missing once is an accident. Missing twice is the start of a new habit. Even the 2-minute version counts.</Muted>
          {data.missed.map((t) => (
            <View key={t.id} style={{ gap: space.sm }}>
              <Body style={{ fontWeight: '600' }}>{t.title}</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Chip label="Do it today" selected={false} onPress={() => void carryOver(ctx, t, today)} />
                {t.twoMinute && <Chip label={`Just: ${t.twoMinute}`} selected={false} onPress={() => void carryOver(ctx, t, today, { twoMinuteOnly: true })} />}
              </View>
            </View>
          ))}
        </Card>
      )}

      <Segmented
        options={[
          { value: 'timeline', label: 'Timeline' },
          { value: 'list', label: 'Tasks' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'timeline' && (
        <Card>
          <SectionTitle right={<Muted>Tap a time to add a block</Muted>}>Schedule</SectionTitle>
          {error && <ErrorNote message={error} />}
          {notice && <Text style={{ color: c.success, fontWeight: '600' }}>{notice}</Text>}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button style={{ flex: 1 }} title="Block" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/plan/block', params: { date } })} />
            <Button style={{ flex: 1 }} title="Task" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/plan/task', params: { date } })} />
          </View>
          <Timeline
            dayKey={date}
            items={data.timeline}
            identities={ids}
            nowMinutes={date === today ? new Date().getHours() * 60 + new Date().getMinutes() : null}
            onPressEmpty={(start) => router.push({ pathname: '/plan/block', params: { date, start: String(start) } })}
            onPressBlock={(id) => router.push({ pathname: '/plan/block', params: { id } })}
            onPressTask={(id) => router.push({ pathname: '/plan/task', params: { id } })}
            onToggleTask={(id) => void toggle(id)}
          />
          {data.tasks.some((t) => !t.localTime) && (
            <Muted>Tasks without a time are in the Tasks list.</Muted>
          )}
        </Card>
      )}

      {mode === 'list' && <Card>
        <SectionTitle right={data.tasks.length > 0 ? <Tally done={done} total={data.tasks.length} /> : undefined}>Tasks</SectionTitle>
        {error && <ErrorNote message={error} />}
        {notice && <Text style={{ color: c.success, fontWeight: '600' }}>{notice}</Text>}
        {data.tasks.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title={date < today ? 'Nothing was planned' : 'Nothing planned yet'}
            message="Keep it small. One task that proves who you're becoming beats ten you won't start."
          />
        ) : (
          data.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              identity={t.identityId ? ids.get(t.identityId) : undefined}
              onToggle={() => void toggle(t.id)}
              onPress={() => router.push({ pathname: '/plan/task', params: { id: t.id } })}
            />
          ))
        )}
        <Button title="Add task" icon="add" onPress={() => router.push({ pathname: '/plan/task', params: { date } })} />
      </Card>}

      <Card>
        <SectionTitle>Votes this week</SectionTitle>
        <Muted>Every action is a vote for the type of person you wish to become.</Muted>
        <VotesList votes={data.votes} empty="Link tasks to who you're becoming to see your votes add up." />
        <Button title="Who I'm becoming" variant="ghost" icon="person-outline" onPress={() => router.push('/plan/identities')} />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ goals (shared by week & month)

function GoalsCard({
  level,
  periodStart,
  title,
  hint,
  goals,
  identities,
  parents,
}: {
  level: PlanLevel;
  periodStart: string;
  title: string;
  hint: string;
  goals: { goal: PlanGoalRecord; tasks: number; done: number; children: PlanGoalRecord[] }[];
  identities: IdentityRecord[];
  parents: PlanGoalRecord[];
}) {
  const ctx = useCtx();
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = byId(identities);
  const active = identities.filter((i) => i.isActive);

  const add = async () => {
    setError(null);
    try {
      await createGoal(ctx, { level, periodStart, text, identityId, parentId });
      setText('');
      setIdentityId(null);
      setParentId(null);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const remove = (g: PlanGoalRecord) =>
    Alert.alert('Remove this goal?', g.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deleteGoal(ctx, g.id) },
    ]);

  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <Muted>{hint}</Muted>
      {goals.map(({ goal, tasks, done, children }) => (
        <Pressable
          key={goal.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!goal.doneAt }}
          accessibilityHint="Long-press to remove"
          onPress={() => void toggleGoalDone(ctx, goal.id)}
          onLongPress={() => remove(goal)}
          style={{ gap: space.xs, paddingVertical: space.xs }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={{ fontSize: 20 }}>{goal.doneAt ? '✅' : '🎯'}</Text>
            <Body style={{ flex: 1, fontWeight: '600', textDecorationLine: goal.doneAt ? 'line-through' : 'none' }}>{goal.text}</Body>
            {tasks > 0 && <Tally done={done} total={tasks} />}
          </View>
          {goal.identityId && ids.get(goal.identityId) && (
            <Text style={{ color: c.success, fontSize: font.small, fontWeight: '600', marginLeft: 28 }}>
              🪪 {identityLabel(ids.get(goal.identityId)!.statement)}
            </Text>
          )}
          {children.map((ch) => (
            <Muted key={ch.id} style={{ marginLeft: 28 }}>
              {ch.doneAt ? '✓' : '•'} {ch.text}
            </Muted>
          ))}
          {tasks > 0 && (
            <View style={{ marginLeft: 28 }}>
              <ProgressBar percent={(done / tasks) * 100} label={`${done} of ${tasks} tasks done`} />
            </View>
          )}
        </Pressable>
      ))}
      {goals.length === 0 && <Muted style={{ fontStyle: 'italic' }}>None yet.</Muted>}
      <Field label={level === 'month' ? 'New focus' : 'New goal'} value={text} onChangeText={setText} maxLength={200} placeholder={level === 'month' ? 'e.g. Finish two books' : 'e.g. Read 100 pages'} />
      {active.length > 0 && (
        <>
          <Muted>Who does this make you?</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {active.map((i) => (
              <Chip key={i.id} label={identityLabel(i.statement)} selected={identityId === i.id} onPress={() => setIdentityId(identityId === i.id ? null : i.id)} />
            ))}
          </View>
        </>
      )}
      {level === 'week' && parents.length > 0 && (
        <>
          <Muted>Serves this month's focus</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {parents.map((p) => (
              <Chip key={p.id} label={p.text} selected={parentId === p.id} onPress={() => setParentId(parentId === p.id ? null : p.id)} />
            ))}
          </View>
        </>
      )}
      {error && <ErrorNote message={error} />}
      <Button title={level === 'month' ? 'Add focus' : 'Add goal'} icon="add" variant="secondary" onPress={add} disabled={!text.trim()} />
    </Card>
  );
}

function ReviewSummary({ level, periodStart, review }: { level: PlanLevel; periodStart: string; review: { wentWell: string | null; makeEasier: string | null; onePercent: string | null } | undefined }) {
  const rows = review
    ? ([
        ['What worked', review.wentWell],
        ['Make it easier', review.makeEasier],
        ['1% better', review.onePercent],
      ] as const).filter(([, v]) => v)
    : [];
  return (
    <Card>
      <SectionTitle>{level === 'week' ? 'Weekly review' : 'Monthly review'}</SectionTitle>
      {rows.length === 0 ? (
        <Muted>A few honest lines: what worked, what to make easier, and how to get 1% better.</Muted>
      ) : (
        rows.map(([k, v]) => (
          <View key={k}>
            <Muted>{k}</Muted>
            <Body>{v}</Body>
          </View>
        ))
      )}
      <Button
        title={rows.length ? 'Edit review' : 'Write review'}
        icon="create-outline"
        variant="secondary"
        onPress={() => router.push({ pathname: '/plan/review', params: { level, start: periodStart } })}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ week

function WeekView({ weekStart, today, setDate, openDay }: { weekStart: string; today: string; setDate: (d: string) => void; openDay: (d: string) => void }) {
  const ctx = useCtx();
  const { c } = useTheme();
  const monthStart = monthStartOf(addDays(weekStart, 3)); // the month most of the week is in
  const { data, isLoading } = useQuery({
    queryKey: ['plan-week', weekStart],
    queryFn: async () => {
      const [plan, identities, monthGoals] = await Promise.all([
        loadPeriod(ctx, 'week', weekStart),
        listIdentities(ctx, { includeArchived: true }),
        listGoals(ctx, 'month', monthStart),
      ]);
      return { plan, identities, monthGoals };
    },
  });
  if (isLoading || !data) return <Loading />;
  const { plan } = data;
  const isCurrent = weekStartOf(today) === weekStart;

  return (
    <>
      <PeriodNav
        label={weekLabel(plan.periodStart, plan.periodEnd)}
        onPrev={() => setDate(addDays(weekStart, -7))}
        onNext={() => setDate(addDays(weekStart, 7))}
        onToday={isCurrent ? undefined : () => setDate(today)}
      />
      {plan.totals.tasks > 0 && (
        <Card>
          <SectionTitle right={<Tally done={plan.totals.done} total={plan.totals.tasks} />}>This week</SectionTitle>
          <ProgressBar percent={(plan.totals.done / plan.totals.tasks) * 100} label="Tasks done this week" />
        </Card>
      )}
      <GoalsCard
        level="week"
        periodStart={weekStart}
        title="Weekly goals"
        hint="1–3 goals. Tap to mark done, long-press to remove. Link tasks to them when you add tasks."
        goals={plan.goals}
        identities={data.identities}
        parents={data.monthGoals}
      />
      <Card>
        <SectionTitle>Days</SectionTitle>
        {plan.days.map((d) => (
          <Pressable
            key={d.localDate}
            accessibilityRole="button"
            onPress={() => openDay(d.localDate)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 44 }}>
              <Text style={{ color: d.localDate === today ? c.primary : c.text, fontWeight: '700' }}>{weekdayName(weekdayOf(d.localDate))}</Text>
              <Muted>{Number(d.localDate.slice(8))}</Muted>
            </View>
            <Body style={{ flex: 1 }} numberOfLines={1}>
              {d.tasks.length ? d.tasks.map((t) => t.title).join(', ') : '—'}
            </Body>
            {d.tasks.length > 0 && <Tally done={d.done} total={d.tasks.length} />}
          </Pressable>
        ))}
      </Card>
      <Card>
        <SectionTitle>Identity votes</SectionTitle>
        <VotesList votes={plan.votes} empty="No votes yet this week. Link tasks to who you're becoming." />
      </Card>
      <ReviewSummary level="week" periodStart={weekStart} review={plan.review} />
    </>
  );
}

// ------------------------------------------------------------------ month

function MonthView({ monthStart, today, setDate, openDay }: { monthStart: string; today: string; setDate: (d: string) => void; openDay: (d: string) => void }) {
  const ctx = useCtx();
  const { c } = useTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['plan-month', monthStart],
    queryFn: async () => {
      const [plan, identities] = await Promise.all([loadPeriod(ctx, 'month', monthStart), listIdentities(ctx, { includeArchived: true })]);
      return { plan, identities };
    },
  });
  // Calendar grid: leading blanks so the 1st lands on its weekday (Mon-first).
  const cells = useMemo(() => {
    if (!data) return [];
    const lead = weekdayOf(monthStart) - 1;
    return [...Array<null>(lead).fill(null), ...data.plan.days];
  }, [data, monthStart]);
  if (isLoading || !data) return <Loading />;
  const { plan } = data;

  return (
    <>
      <PeriodNav
        label={monthLabel(monthStart)}
        onPrev={() => setDate(shiftPeriod('month', monthStart, -1))}
        onNext={() => setDate(shiftPeriod('month', monthStart, 1))}
        onToday={monthStartOf(today) === monthStart ? undefined : () => setDate(today)}
      />
      <GoalsCard
        level="month"
        periodStart={monthStart}
        title="Monthly focus"
        hint="1–3 focuses for the month. Break each into weekly goals in the Week view."
        goals={plan.goals}
        identities={data.identities}
        parents={[]}
      />
      <Card>
        <SectionTitle right={plan.totals.tasks > 0 ? <Tally done={plan.totals.done} total={plan.totals.tasks} /> : undefined}>Calendar</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <Text key={w} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: font.small }}>
              {weekdayName(w).slice(0, 2)}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
            const total = d.tasks.length;
            const full = total > 0 && d.done === total;
            const some = d.done > 0 && !full;
            return (
              <Pressable
                key={d.localDate}
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(d.localDate)}: ${d.done} of ${total} done`}
                onPress={() => openDay(d.localDate)}
                style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: full ? c.success : some ? c.successSoft : total ? c.cardAlt : 'transparent',
                    borderWidth: d.localDate === today ? 2 : 0,
                    borderColor: c.primary,
                  }}
                >
                  <Text style={{ color: full ? c.primaryText : c.text, fontWeight: '600' }}>{Number(d.localDate.slice(8))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Muted>Dark green: everything done · light green: some done · grey: planned.</Muted>
      </Card>
      <Card>
        <SectionTitle>Identity votes this month</SectionTitle>
        <VotesList votes={plan.votes} empty="No votes yet this month." />
      </Card>
      <ReviewSummary level="month" periodStart={monthStart} review={plan.review} />
    </>
  );
}
