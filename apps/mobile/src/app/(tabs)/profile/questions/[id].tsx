import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { QuestionType } from '@journal/shared';
import { describeError } from '../../../../api/client';
import { Body, Button, Card, ErrorNote, Field, Loading, Muted, Screen, Segmented, ToggleRow } from '../../../../components/ui';
import { createQuestion, deleteQuestion, getQuestion, updateQuestion } from '../../../../data/journal';
import { useCtx } from '../../../../state/session';

export default function QuestionEditor() {
  const ctx = useCtx();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useQuery({ queryKey: ['question', id], queryFn: () => getQuestion(ctx, id), enabled: !isNew });

  const [text, setText] = useState('');
  const [type, setType] = useState<QuestionType>('text');
  const [required, setRequired] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = existing.data;
    if (!q) return;
    setText(q.text);
    setType(q.type);
    setRequired(q.isRequired);
    setActive(q.isActive);
  }, [existing.data]);

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && !existing.data) return <Screen><Body>This question no longer exists.</Body></Screen>;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const draft = { text, type, isRequired: required, isActive: active };
      if (isNew) await createQuestion(ctx, draft);
      else await updateQuestion(ctx, id, draft);
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const archived = !!existing.data?.archivedAt;

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New question' : 'Edit question' }} />
      <Card>
        <Field label="Question" value={text} onChangeText={setText} multiline placeholder="e.g. What made you smile today?" />
        <Body style={{ fontWeight: '600' }}>Answer type</Body>
        <Segmented
          options={[
            { value: 'text', label: 'Text' },
            { value: 'emoji', label: 'Emoji (5 moods)' },
          ]}
          value={type}
          onChange={setType}
        />
        <ToggleRow label="Required" hint="Marked as required, but you can always save a partly completed day." value={required} onChange={setRequired} />
        <ToggleRow label="Enabled" hint="Turn off to hide it from your daily routine." value={active} onChange={setActive} />
        {!isNew && <Muted>Past answers keep the question text they were written for.</Muted>}
      </Card>
      {error && <ErrorNote message={error} />}
      <Button title="Save" icon="checkmark" onPress={save} loading={saving} disabled={!text.trim()} />
      {!isNew && (
        <>
          <Button
            title={archived ? 'Restore from archive' : 'Archive'}
            variant="secondary"
            icon="archive-outline"
            onPress={async () => {
              await updateQuestion(ctx, id, { archived: !archived });
              router.back();
            }}
          />
          <Button
            title="Delete question"
            variant="danger"
            icon="trash-outline"
            onPress={() =>
              Alert.alert('Delete this question?', 'Past answers are kept in your history.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteQuestion(ctx, id);
                    router.back();
                  },
                },
              ])
            }
          />
        </>
      )}
    </Screen>
  );
}
