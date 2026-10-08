import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { describeError } from '../../../api/client';
import { Body, Button, Card, Chip, Divider, EmptyState, ErrorNote, Field, IconButton, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { createIdentity, deleteIdentity, listIdentities, updateIdentity } from '../../../data/planner';
import { space, useTheme } from '../../../lib/theme';
import { useCtx } from '../../../state/session';

const EXAMPLES = ['I am a reader', 'I am someone who moves every day', 'I am a calm, focused person', 'I am a person who keeps promises to myself'];

export default function Identities() {
  const ctx = useCtx();
  const { c } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ['identities'], queryFn: () => listIdentities(ctx, { includeArchived: true }) });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const add = async (statement = text) => {
    setError(null);
    try {
      await createIdentity(ctx, statement);
      setText('');
    } catch (e) {
      setError(describeError(e));
    }
  };

  const remove = (id: string, statement: string) =>
    Alert.alert('Delete this identity?', `"${statement}". Tasks linked to it stay, but stop counting as votes.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteIdentity(ctx, id) },
    ]);

  const unused = EXAMPLES.filter((e) => !data.some((d) => d.statement.toLowerCase() === e.toLowerCase()));

  return (
    <Screen>
      <Muted>
        Lasting change starts with identity, not outcomes. Decide who you want to be, then prove it to yourself with small
        wins. Each task you finish is a vote.
      </Muted>
      <Card>
        <Field
          label="I am…"
          value={text}
          onChangeText={setText}
          placeholder="I am a reader"
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (text.trim()) void add();
          }}
        />
        {error && <ErrorNote message={error} />}
        <Button title="Add identity" icon="add" onPress={() => void add()} disabled={!text.trim()} />
        {unused.length > 0 && (
          <>
            <Muted>Ideas</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {unused.map((e) => (
                <Chip key={e} label={e} selected={false} onPress={() => void add(e)} />
              ))}
            </View>
          </>
        )}
      </Card>
      <Card>
        <SectionTitle>Who I'm becoming</SectionTitle>
        {data.length === 0 ? (
          <EmptyState icon="person-outline" title="No identities yet" message="Start with one. You can add more later." />
        ) : (
          data.map((i, n) => (
            <View key={i.id} style={{ gap: space.sm }}>
              {n > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600', color: i.isActive ? c.text : c.muted }}>{i.statement}</Body>
                  {!i.isActive && <Muted>Paused: not offered for new tasks</Muted>}
                </View>
                <IconButton
                  icon={i.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                  label={i.isActive ? 'Pause' : 'Resume'}
                  onPress={() => void updateIdentity(ctx, i.id, { isActive: !i.isActive })}
                />
                <IconButton icon="trash-outline" label="Delete" color={c.danger} onPress={() => remove(i.id, i.statement)} />
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
