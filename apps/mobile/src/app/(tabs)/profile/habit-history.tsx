import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { toLocalDate } from '@journal/shared';
import { Body, Card, EmptyState, Loading, Muted, Screen } from '../../../components/ui';
import { shortDay } from '../../../components/widgets';
import { habitHistory } from '../../../data/dashboard';
import { useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

export default function HabitHistoryScreen() {
  const ctx = useCtx();
  const { c } = useTheme();
  const today = toLocalDate();
  const { data, isLoading } = useQuery({ queryKey: ['habitHistory', today], queryFn: () => habitHistory(ctx, today, 14) });
  if (isLoading || !data) return <Loading />;

  const cellColor = (p: number | null) =>
    p === null ? 'transparent' : p >= 100 ? c.success : p > 0 ? c.primary : c.track;

  return (
    <Screen>
      <Muted>Last 14 days. Filled = complete, blue = partly done, grey = scheduled, blank = not scheduled.</Muted>
      {data.length === 0 ? (
        <EmptyState icon="stats-chart-outline" title="No habit history yet" />
      ) : (
        data.map((h) => (
          <Card key={h.habitId}>
            <Body style={{ fontWeight: '600' }}>{h.name}</Body>
            <Muted>
              Completed on {h.completedDays} of {h.scheduledDays} scheduled days
            </Muted>
            <View
              accessible
              accessibilityLabel={h.days
                .map((d) => `${shortDay(d.localDate)} ${d.progress === null ? 'not scheduled' : `${Math.round(d.progress)}%`}`)
                .join(', ')}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              {h.days.map((d) => (
                <View key={d.localDate} style={{ alignItems: 'center', gap: 2 }}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      backgroundColor: cellColor(d.progress),
                      borderWidth: d.progress === null ? 1 : 0,
                      borderColor: c.border,
                      opacity: d.progress !== null && d.progress > 0 && d.progress < 100 ? 0.4 + d.progress / 200 : 1,
                    }}
                  />
                  <Muted style={{ fontSize: 10 }}>{shortDay(d.localDate).slice(0, 1)}</Muted>
                </View>
              ))}
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
