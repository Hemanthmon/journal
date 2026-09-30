import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { formatLongDate, moodOption } from '@journal/shared';
import { Body, EmptyState, Loading, Muted, Screen } from '../../../components/ui';
import { journalHistory } from '../../../data/dashboard';
import { radius, space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

export default function History() {
  const ctx = useCtx();
  const { c } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ['journalHistory'], queryFn: () => journalHistory(ctx) });
  if (isLoading || !data) return <Loading />;

  return (
    <Screen>
      {data.length === 0 ? (
        <EmptyState icon="book-outline" title="No journal entries yet" message="Entries you write in Daily Routine appear here." />
      ) : (
        <View style={{ gap: space.sm }}>
          {data.map((d) => {
            const mood = moodOption(d.mood);
            return (
              <Pressable
                key={d.localDate}
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(d.localDate)}. Open to review or edit`}
                onPress={() => router.navigate({ pathname: '/routine', params: { date: d.localDate } })}
                style={({ pressed }) => ({
                  backgroundColor: c.card,
                  borderRadius: radius.md,
                  padding: space.md,
                  gap: 4,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Body style={{ fontWeight: '600' }}>{formatLongDate(d.localDate)}</Body>
                  {mood && <Body accessibilityLabel={mood.label}>{mood.emoji}</Body>}
                </View>
                {d.preview ? <Muted numberOfLines={2}>{d.preview}</Muted> : <Muted>{d.answered} answered</Muted>}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
