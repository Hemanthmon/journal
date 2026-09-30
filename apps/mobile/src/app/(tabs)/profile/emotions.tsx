import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import type { EmotionOptionRecord } from '@journal/shared';
import { describeError } from '../../../api/client';
import { ReorderList } from '../../../components/ReorderList';
import { Body, Button, Card, EmptyState, ErrorNote, Field, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { addEmotion, listEmotions, removeEmotion, reorderEmotions } from '../../../data/emotions';
import { useCtx } from '../../../state/session';

/** Add, remove and reorder the emotion chips shown in the urge form. */
export default function ManageEmotions() {
  const ctx = useCtx();
  const { data, isLoading } = useQuery({ queryKey: ['emotions'], queryFn: () => listEmotions(ctx) });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const add = async () => {
    setError(null);
    try {
      await addEmotion(ctx, name);
      setName('');
    } catch (e) {
      setError(describeError(e));
    }
  };

  const confirmRemove = (e: EmotionOptionRecord) =>
    Alert.alert(`Remove "${e.name}"?`, 'It will no longer appear as a choice. Past urge records keep it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeEmotion(ctx, e.id) },
    ]);

  return (
    <Screen>
      <Muted>These are the choices for "Emotion felt before the urge" when you record an urge.</Muted>
      <Card>
        <Field
          label="Add an emotion"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Homesick"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (name.trim()) void add();
          }}
        />
        {error && <ErrorNote message={error} />}
        <Button title="Add" icon="add" onPress={add} disabled={!name.trim()} />
      </Card>
      <Card>
        <SectionTitle>Your emotions</SectionTitle>
        <Muted>Tap one to remove it. Use the arrows to change the order.</Muted>
        {data.length === 0 ? (
          <EmptyState icon="happy-outline" title="No emotions in your list" message="Add a few above." />
        ) : (
          <ReorderList
            items={data}
            label={(e) => e.name}
            renderItem={(e) => <Body>{e.name}</Body>}
            onPress={confirmRemove}
            onReorder={(ids) => void reorderEmotions(ctx, ids)}
          />
        )}
      </Card>
    </Screen>
  );
}
