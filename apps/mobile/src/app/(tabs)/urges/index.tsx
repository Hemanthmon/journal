import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, formatShortDate, formatTime12, formatUrgeDuration, toLocalDate, weekdayName, weekdayOf } from '@journal/shared';
import { Body, Button, Card, Chip, EmptyState, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { DateNavigator, MiniBars, shortDay } from '../../../components/widgets';
import { listUrges, urgeTrends, trackingStart, urgeFreeStreak } from '../../../data/urges';
import { radius, space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

type Filter = 'day' | '7' | '30' | 'all';

export default function Urges() {
  const ctx = useCtx();
  const { c } = useTheme();
  const today = toLocalDate();
  const [filter, setFilter] = useState<Filter>('7');
  const [day, setDay] = useState(today);

  const range =
    filter === 'day'
      ? { from: day, to: day }
      : filter === 'all'
        ? {}
        : { from: addDays(today, -(Number(filter) - 1)), to: today };

  const list = useQuery({ queryKey: ['urges', filter, day], queryFn: () => listUrges(ctx, range) });
  const trends = useQuery({ queryKey: ['urgeTrends', today], queryFn: () => urgeTrends(ctx, today, 7) });
  const tracking = useQuery({
    queryKey: ['urgeTracking', today],
    queryFn: async () => ({ start: await trackingStart(ctx), streak: await urgeFreeStreak(ctx, today) }),
  });
  const start = tracking.data?.start ?? null;
  const freeDays = trends.data && start ? trends.data.days.filter((d) => d.localDate >= start && d.count === 0).length : 0;

  return (
    <Screen>
      <Button
        title="Having an urge? Breathe for 2 min"
        icon="leaf-outline"
        accessibilityHint="Starts a guided 2-minute breathing exercise"
        onPress={() => router.push('/urges/breathe')}
      />
      <Button title="Record an urge" variant="secondary" icon="add-circle-outline" onPress={() => router.push('/urges/new')} />

      {trends.data && (trends.data.total > 0 || freeDays > 0) && (
        <Card>
          <SectionTitle>Last 7 days</SectionTitle>
          {freeDays > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.successSoft, borderRadius: 12, padding: space.sm }}>
              <Ionicons name="leaf" size={18} color={c.success} />
              <Body style={{ color: c.success, fontWeight: '700', flex: 1 }}>
                {freeDays} urge-free day{freeDays === 1 ? '' : 's'} this week
                {(tracking.data?.streak ?? 0) > 1 ? ` · ${tracking.data!.streak} in a row` : ''}
              </Body>
            </View>
          )}
          <MiniBars
            label="Urges per day, last 7 days"
            max={Math.max(1, ...trends.data.days.map((d) => d.count))}
            data={trends.data.days.map((d) => ({
              key: d.localDate,
              label: shortDay(d.localDate),
              value: d.count,
              caption: d.count === 0 && start && d.localDate >= start ? '🌿' : String(d.count),
            }))}
          />
          <Muted>
            {trends.data.total} recorded · average intensity {trends.data.avgIntensity?.toFixed(1) ?? '–'}
          </Muted>
          {trends.data.topTriggers.length > 0 && (
            <Muted>Common triggers: {trends.data.topTriggers.map((t) => `${t.label} (${t.count})`).join(', ')}</Muted>
          )}
          {trends.data.topEmotions.length > 0 && (
            <Muted>Common feelings before: {trends.data.topEmotions.map((t) => `${t.label} (${t.count})`).join(', ')}</Muted>
          )}
        </Card>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Chip label="7 days" selected={filter === '7'} onPress={() => setFilter('7')} />
        <Chip label="30 days" selected={filter === '30'} onPress={() => setFilter('30')} />
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="By date" selected={filter === 'day'} onPress={() => setFilter('day')} />
      </View>
      {filter === 'day' && <DateNavigator date={day} onChange={setDay} />}

      {list.isLoading || !list.data ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <EmptyState icon="pulse-outline" title="No records for this period" />
      ) : (
        <View style={{ gap: space.sm }}>
          {list.data.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayName(weekdayOf(u.localDate), 'long')} ${formatShortDate(u.localDate)} at ${formatTime12(u.localTime)}, intensity ${u.intensity}. Edit`}
              onPress={() => router.push(`/urges/${u.id}`)}
              style={({ pressed }) => ({
                backgroundColor: c.card,
                borderRadius: radius.md,
                padding: space.md,
                flexDirection: 'row',
                gap: space.md,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Body style={{ fontWeight: '700', color: c.primary }}>{u.intensity}</Body>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Body>
                  {weekdayName(weekdayOf(u.localDate))} {formatShortDate(u.localDate)} · {formatTime12(u.localTime)}
                  {u.durationMinutes != null ? ` · ${formatUrgeDuration(u.durationMinutes)}` : ''}
                </Body>
                <Muted numberOfLines={1}>{u.triggerText ?? u.emotionBefore ?? 'No details'}</Muted>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
