import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { formatTime12, moodOption, toLocalDate } from '@journal/shared';
import { ReminderCarousel } from '../../components/ReminderCarousel';
import { SessionBanner } from '../../components/SessionBanner';
import {
  Body,
  Button,
  Card,
  EmptyState,
  Loading,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
  Title,
} from '../../components/ui';
import { MiniBars, shortDay } from '../../components/widgets';
import { loadDashboard } from '../../data/dashboard';
import { radius, space, useTheme } from '../../lib/theme';
import { usePrefs } from '../../state/prefs';
import { useCtx, useSession } from '../../state/session';
import { syncService } from '../../state/sync';

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name.split(' ')[0]}`;
}

export default function Dashboard() {
  const ctx = useCtx();
  const user = useSession((s) => s.user);
  const showUrges = usePrefs((s) => s.showUrgesOnDashboard);
  const { c } = useTheme();
  const [today, setToday] = useState(toLocalDate());
  // Pick up a new day if the app stays open past midnight.
  useFocusEffect(useCallback(() => setToday(toLocalDate()), []));

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => loadDashboard(ctx, today),
  });

  if (isLoading || !data) return <Loading />;
  const { habits, journal, urges, week, reminders, intention } = data;
  const mood = moodOption(journal.mood);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            void syncService.syncNow();
            void refetch();
          }}
        />
      }
    >
      <SessionBanner />
      <Title>{user ? greeting(user.name) : 'Hello'}</Title>

      <ReminderCarousel reminders={reminders} onPress={() => router.navigate('/profile/reminders', { withAnchor: true })} />

      {intention && (
        <View
          accessible
          accessibilityLabel={`Your focus today, from yesterday's reflection: ${intention.text}`}
          style={{
            backgroundColor: c.successSoft,
            borderRadius: radius.lg,
            padding: space.lg,
            gap: space.xs,
            borderLeftWidth: 4,
            borderLeftColor: c.success,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Ionicons name="flag-outline" size={16} color={c.success} />
            <Muted style={{ color: c.success, fontWeight: '700' }}>Your focus today</Muted>
          </View>
          <Body style={{ fontSize: 17, fontWeight: '600' }}>{intention.text}</Body>
          <Muted>From yesterday's reflection</Muted>
        </View>
      )}

      <Card>
        <SectionTitle>Today's habits</SectionTitle>
        {habits.scheduled === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="No habits scheduled today"
            message="Add habits under Profile → Manage habits."
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Body>
                {habits.completed} of {habits.scheduled} complete
              </Body>
              <Body style={{ fontWeight: '700' }}>{Math.round(habits.percent ?? 0)}%</Body>
            </View>
            <ProgressBar percent={habits.percent ?? 0} label="Today's overall habit progress" />
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              {habits.habits.map((h) => (
                <View key={h.habit.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Muted style={{ color: c.text }}>{h.habit.name}</Muted>
                    <Muted>{Math.round(h.progress)}%</Muted>
                  </View>
                  <ProgressBar percent={h.progress} label={`${h.habit.name} progress`} />
                </View>
              ))}
            </View>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Daily journal</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Ionicons
            name={journal.answered > 0 ? 'book' : 'book-outline'}
            size={24}
            color={journal.answered > 0 ? c.success : c.muted}
          />
          <View style={{ flex: 1 }}>
            <Body>
              {journal.answered === 0
                ? 'Not started yet'
                : `${journal.answered} of ${journal.total} question${journal.total === 1 ? '' : 's'} answered`}
            </Body>
            <Muted>{mood ? `Mood: ${mood.emoji} ${mood.label}` : 'Mood not recorded'}</Muted>
          </View>
        </View>
        <Button title="Open daily routine" icon="create-outline" onPress={() => router.navigate('/routine')} />
      </Card>

      {showUrges && (
        <Card>
          <SectionTitle>Urge tracker</SectionTitle>
          <Body>
            {urges.todayCount === 0
              ? 'No urges recorded today'
              : `${urges.todayCount} recorded today`}
          </Body>
          {urges.recent.length > 0 && (
            <View style={{ gap: 4 }}>
              <Muted>Recent</Muted>
              {urges.recent.map((u) => (
                <Muted key={u.id} numberOfLines={1}>
                  {shortDay(u.localDate)} {formatTime12(u.localTime)} · intensity {u.intensity}
                  {u.triggerText ? ` · ${u.triggerText}` : ''}
                </Muted>
              ))}
            </View>
          )}
          <Button title="Breathe for 2 min" icon="leaf-outline" onPress={() => router.navigate('/urges/breathe', { withAnchor: true })} />
          <Button
            title="Record an urge"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.navigate('/urges/new', { withAnchor: true })}
          />
        </Card>
      )}

      <Card>
        <SectionTitle>This week</SectionTitle>
        <Muted>Habit completion</Muted>
        <MiniBars
          label="Habit completion over the last 7 days"
          data={week.map((d) => ({
            key: d.localDate,
            label: shortDay(d.localDate),
            value: d.habitPercent,
          }))}
        />
        <Muted>Mood</Muted>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d) => {
            const m = moodOption(d.mood);
            return (
              <View
                key={d.localDate}
                accessible
                accessibilityLabel={`${shortDay(d.localDate)}: ${m ? m.label : 'no mood recorded'}`}
                style={{ flex: 1, alignItems: 'center', gap: 2 }}
              >
                <Body style={{ fontSize: 20 }}>{m ? m.emoji : '·'}</Body>
                <Muted>{shortDay(d.localDate)}</Muted>
              </View>
            );
          })}
        </View>
        <Muted>Journal</Muted>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d) => (
            <View
              key={d.localDate}
              accessible
              accessibilityLabel={`${shortDay(d.localDate)}: ${d.journalWritten ? 'journal written' : 'no journal entry'}`}
              style={{ flex: 1, alignItems: 'center' }}
            >
              <Ionicons
                name={d.journalWritten ? 'ellipse' : 'ellipse-outline'}
                size={14}
                color={d.journalWritten ? c.success : c.border}
              />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
