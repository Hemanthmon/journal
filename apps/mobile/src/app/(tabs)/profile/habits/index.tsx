import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MEASUREMENT_LABELS, weekdayName, type HabitRecord } from '@journal/shared';
import { ReorderList } from '../../../../components/ReorderList';
import { Body, Button, Card, EmptyState, Loading, Muted, Screen, SectionTitle } from '../../../../components/ui';
import { listHabits, reorderHabits } from '../../../../data/habits';
import { useCtx } from '../../../../state/session';

function scheduleText(days: number[]) {
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '1,2,3,4,5,6') return 'Mon–Sat';
  return days.map((d) => weekdayName(d)).join(', ');
}

function targetText(h: HabitRecord) {
  return h.measurementType === 'boolean' ? 'Yes / No' : `${h.targetValue} ${h.unit ?? ''}`.trim();
}

export default function ManageHabits() {
  const ctx = useCtx();
  const { data, isLoading } = useQuery({ queryKey: ['habits'], queryFn: () => listHabits(ctx) });
  if (isLoading || !data) return <Loading />;

  const current = data.filter((h) => !h.archivedAt);
  const archived = data.filter((h) => h.archivedAt);
  const row = (h: HabitRecord) => (
    <>
      <Body>
        {h.name}
        {!h.isActive ? ' (off)' : ''}
      </Body>
      <Muted>
        {MEASUREMENT_LABELS[h.measurementType]} · {targetText(h)} · {scheduleText(h.scheduleDays)}
      </Muted>
    </>
  );

  return (
    <Screen>
      <Button title="Add habit" icon="add" onPress={() => router.push('/profile/habits/new')} />
      <Card>
        <SectionTitle>Your habits</SectionTitle>
        {current.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="No habits yet"
            message="Add something small — like a 10-minute walk or drinking water."
          />
        ) : (
          <ReorderList
            items={current}
            label={(h) => h.name}
            renderItem={row}
            onPress={(h) => router.push(`/profile/habits/${h.id}`)}
            onReorder={(ids) => void reorderHabits(ctx, [...ids, ...archived.map((a) => a.id)])}
          />
        )}
      </Card>
      {archived.length > 0 && (
        <Card>
          <SectionTitle>Archived</SectionTitle>
          <Muted>Archived habits keep their history but aren't shown in your daily routine.</Muted>
          <ReorderList
            items={archived}
            label={(h) => h.name}
            renderItem={row}
            onPress={(h) => router.push(`/profile/habits/${h.id}`)}
            onReorder={(ids) => void reorderHabits(ctx, [...current.map((c) => c.id), ...ids])}
          />
        </Card>
      )}
    </Screen>
  );
}
