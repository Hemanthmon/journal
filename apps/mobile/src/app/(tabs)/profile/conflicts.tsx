import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { formatLongDate } from '@journal/shared';
import { Body, Button, Card, EmptyState, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { listConflicts, resolveConflict, type ConflictItem, type Resolution } from '../../../sync/conflicts';
import { radius, space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';
import { syncService } from '../../../state/sync';

/** Journal answers edited on two devices before syncing. Nothing is lost until the user chooses. */
export default function Conflicts() {
  const ctx = useCtx();
  const qc = useQueryClient();
  const { c } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ['conflicts'], queryFn: () => listConflicts(ctx.db) });
  if (isLoading || !data) return <Loading />;

  const resolve = async (item: ConflictItem, choice: Resolution) => {
    await resolveConflict(ctx, item, choice);
    await qc.invalidateQueries();
    void syncService.syncNow();
  };

  const box = (label: string, text: string) => (
    <View style={{ gap: 4 }}>
      <Muted>{label}</Muted>
      <View style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md }}>
        <Body>{text || '(empty)'}</Body>
      </View>
    </View>
  );

  return (
    <Screen>
      {data.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="Nothing to review" />
      ) : (
        <>
          <Muted>
            These answers were edited on another device before this one synced. Choose which version to keep.
          </Muted>
          {data.map((item) => (
            <Card key={item.id}>
              <SectionTitle>{item.question}</SectionTitle>
              {item.localDate && <Muted>{formatLongDate(item.localDate)}</Muted>}
              {box('This device', item.mine)}
              {box('Other device', item.theirs)}
              <Button title="Keep both" icon="git-merge-outline" onPress={() => void resolve(item, 'both')} />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button style={{ flex: 1 }} variant="secondary" title="Keep this device's" onPress={() => void resolve(item, 'mine')} />
                <Button style={{ flex: 1 }} variant="secondary" title="Keep other" onPress={() => void resolve(item, 'theirs')} />
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
