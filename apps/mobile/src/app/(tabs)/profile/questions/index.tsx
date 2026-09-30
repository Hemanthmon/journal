import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { JournalQuestionRecord } from '@journal/shared';
import { ReorderList } from '../../../../components/ReorderList';
import { Body, Button, Card, EmptyState, Loading, Muted, Screen, SectionTitle } from '../../../../components/ui';
import { listQuestions, reorderQuestions } from '../../../../data/journal';
import { useCtx } from '../../../../state/session';

export default function ManageQuestions() {
  const ctx = useCtx();
  const { data, isLoading } = useQuery({ queryKey: ['questions'], queryFn: () => listQuestions(ctx) });
  if (isLoading || !data) return <Loading />;

  const row = (q: JournalQuestionRecord) => (
    <>
      <Body>{q.text}</Body>
      <Muted>
        {q.type === 'emoji' ? 'Emoji' : 'Text'} · {q.isRequired ? 'Required' : 'Optional'}
        {!q.isActive ? ' · Off' : ''}
        {q.archivedAt ? ' · Archived' : ''}
      </Muted>
    </>
  );

  return (
    <Screen>
      <Button title="Add question" icon="add" onPress={() => router.push('/profile/questions/new')} />
      <Card>
        <SectionTitle>Reflection questions</SectionTitle>
        <Muted>Shown in this order in your daily routine. Editing a question keeps past answers as they were.</Muted>
        {data.length === 0 ? (
          <EmptyState icon="chatbubbles-outline" title="No questions" />
        ) : (
          <ReorderList
            items={data}
            label={(q) => q.text}
            renderItem={row}
            onPress={(q) => router.push(`/profile/questions/${q.id}`)}
            onReorder={(ids) => void reorderQuestions(ctx, ids)}
          />
        )}
      </Card>
    </Screen>
  );
}
