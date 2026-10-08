import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { isPeriodStart, type PlanLevel } from '@journal/shared';
import { useEffect, useState } from 'react';
import { describeError } from '../../../api/client';
import { VotesList, monthLabel, weekLabel } from '../../../components/planner';
import { Body, Button, Card, ErrorNote, Field, Loading, Muted, Screen, SectionTitle } from '../../../components/ui';
import { loadPeriod, periodEnd, saveReview } from '../../../data/planner';
import { useCtx } from '../../../state/session';

export default function Review() {
  const ctx = useCtx();
  const params = useLocalSearchParams<{ level?: string; start?: string }>();
  const level: PlanLevel = params.level === 'month' ? 'month' : 'week';
  const start = params.start ?? '';
  const valid = isPeriodStart(level, start);

  const { data, isLoading } = useQuery({
    queryKey: ['plan-review', level, start],
    queryFn: () => loadPeriod(ctx, level, start),
    enabled: valid,
  });
  const [wentWell, setWentWell] = useState('');
  const [makeEasier, setMakeEasier] = useState('');
  const [onePercent, setOnePercent] = useState('');
  const [filled, setFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || filled) return;
    setWentWell(data.review?.wentWell ?? '');
    setMakeEasier(data.review?.makeEasier ?? '');
    setOnePercent(data.review?.onePercent ?? '');
    setFilled(true);
  }, [data, filled]);

  if (!valid) return <Screen><ErrorNote message="This period doesn't exist." /></Screen>;
  if (isLoading || !data) return <Loading />;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveReview(ctx, level, start, { wentWell, makeEasier, onePercent });
      router.back();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const goalsDone = data.goals.filter((g) => g.goal.doneAt).length;

  return (
    <Screen>
      <Card>
        <SectionTitle>{level === 'week' ? weekLabel(start, periodEnd('week', start)) : monthLabel(start)}</SectionTitle>
        <Body>
          {data.totals.done} of {data.totals.tasks} tasks done · {goalsDone} of {data.goals.length} {level === 'week' ? 'goals' : 'focuses'} reached
        </Body>
        <VotesList votes={data.votes} empty="No identity votes this time." />
      </Card>
      <Card>
        <Muted>No judgement, just notice. You're not looking for perfect, only 1% better.</Muted>
        <Field label="What worked? What am I proud of?" value={wentWell} onChangeText={setWentWell} multiline maxLength={2000} />
        <Field
          label="What got in the way? How can I make it easier?"
          value={makeEasier}
          onChangeText={setMakeEasier}
          multiline
          maxLength={2000}
          hint="Change the environment, shrink the habit, or attach it to something you already do."
        />
        <Field
          label={`How will I get 1% better next ${level}?`}
          value={onePercent}
          onChangeText={setOnePercent}
          multiline
          maxLength={2000}
        />
        {error && <ErrorNote message={error} />}
        <Button title="Save review" icon="checkmark" onPress={save} loading={busy} />
      </Card>
    </Screen>
  );
}
