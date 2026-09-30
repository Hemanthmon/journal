import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import type { ReminderRecord } from '@journal/shared';
import { describeError } from '../../../../api/client';
import { ReorderList } from '../../../../components/ReorderList';
import { Body, Button, Card, EmptyState, ErrorNote, Field, Loading, Muted, Screen, SectionTitle } from '../../../../components/ui';
import { createReminder, listReminders, reorderReminders } from '../../../../data/reminders';
import { useCtx } from '../../../../state/session';

const EXAMPLES = ['Phone stays outside the bedroom', 'Urges pass. Breathe for 2 minutes.', 'Drink water before coffee'];

export default function ManageReminders() {
  const ctx = useCtx();
  const { data, isLoading } = useQuery({ queryKey: ['reminders'], queryFn: () => listReminders(ctx) });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Loading />;

  const add = async () => {
    setError(null);
    try {
      await createReminder(ctx, text);
      setText('');
    } catch (e) {
      setError(describeError(e));
    }
  };

  const row = (r: ReminderRecord) => (
    <>
      <Body>{r.text}</Body>
      {!r.isActive && <Muted>Paused — not shown on the Dashboard</Muted>}
    </>
  );

  return (
    <Screen>
      <Muted>These appear at the top of your Dashboard every day. With two or more, they slide automatically.</Muted>
      <Card>
        <Field
          label="New reminder"
          value={text}
          onChangeText={setText}
          placeholder={EXAMPLES[data.length % EXAMPLES.length]}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (text.trim()) void add();
          }}
        />
        {error && <ErrorNote message={error} />}
        <Button title="Add reminder" icon="add" onPress={add} disabled={!text.trim()} />
      </Card>
      <Card>
        <SectionTitle>Your reminders</SectionTitle>
        {data.length === 0 ? (
          <EmptyState
            icon="sparkles-outline"
            title="No reminders yet"
            message="Add a short line you want to see every day — a rule, a goal, or a kind word to yourself."
          />
        ) : (
          <ReorderList
            items={data}
            label={(r) => r.text}
            renderItem={row}
            onPress={(r) => router.push(`/profile/reminders/${r.id}`)}
            onReorder={(ids) => void reorderReminders(ctx, ids)}
          />
        )}
      </Card>
    </Screen>
  );
}
