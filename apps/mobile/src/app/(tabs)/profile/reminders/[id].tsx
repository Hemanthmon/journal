import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { describeError } from '../../../../api/client';
import { Body, Button, Card, ErrorNote, Field, Loading, Screen, ToggleRow } from '../../../../components/ui';
import { deleteReminder, getReminder, updateReminder } from '../../../../data/reminders';
import { useCtx } from '../../../../state/session';

export default function ReminderEditor() {
  const ctx = useCtx();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useQuery({ queryKey: ['reminder', id], queryFn: () => getReminder(ctx, id) });
  const [text, setText] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setText(existing.data.text);
    setActive(existing.data.isActive);
  }, [existing.data]);

  if (existing.isLoading) return <Loading />;
  if (!existing.data) {
    return (
      <Screen>
        <Body>This reminder no longer exists.</Body>
      </Screen>
    );
  }

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateReminder(ctx, id, { text, isActive: active });
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Reminder" value={text} onChangeText={setText} multiline maxLength={200} />
        <ToggleRow label="Show on Dashboard" hint="Turn off to pause it without deleting." value={active} onChange={setActive} />
        {error && <ErrorNote message={error} />}
      </Card>
      <Button title="Save" icon="checkmark" onPress={save} loading={saving} disabled={!text.trim()} />
      <Button
        title="Delete reminder"
        variant="danger"
        icon="trash-outline"
        onPress={() =>
          Alert.alert('Delete this reminder?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteReminder(ctx, id);
                router.back();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
