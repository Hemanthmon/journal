import { useEffect, useState } from 'react';
import {
  planReviewId,
  type IdentityRecord,
  type PlanGoalRecord,
  type PlanLevel,
  type PlanReviewRecord,
} from '@journal/shared';
import { errorMessage } from '../api';
import { Card, ErrorBox } from '../components/ui';
import { newId, remove, save, useOwnerData, type OwnerRecords } from './store';

/**
 * The owner's planner editing on the website: who I'm becoming, monthly focuses, weekly
 * goals and the two reviews. Each change saves at once and refreshes the planner above.
 */
export function PlannerEditor({
  weekStart,
  weekEnd,
  monthStart,
  monthEnd,
  onChanged,
}: {
  weekStart: string;
  weekEnd: string;
  monthStart: string;
  monthEnd: string;
  onChanged: () => void;
}) {
  const from = weekStart < monthStart ? weekStart : monthStart;
  const to = weekEnd > monthEnd ? weekEnd : monthEnd;
  const { data, error, reload } = useOwnerData(from, to);
  const [problem, setProblem] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const r = data.records;

  const run = async (fn: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };

  return (
    <div className="stack">
      <h2 style={{ margin: '8px 0 0' }}>Edit your plan</h2>
      {problem && <ErrorBox message={problem} />}
      <div className="grid two">
        <Identities records={r} run={run} />
        <Goals
          level="month"
          title="Monthly focus"
          periodStart={monthStart}
          goals={r.planGoals.filter((g) => g.level === 'month' && g.periodStart === monthStart)}
          parents={[]}
          identities={r.identities}
          run={run}
        />
      </div>
      <div className="grid two">
        <Goals
          level="week"
          title="Weekly goals"
          periodStart={weekStart}
          goals={r.planGoals.filter((g) => g.level === 'week' && g.periodStart === weekStart)}
          parents={r.planGoals.filter((g) => g.level === 'month' && g.periodStart === monthStart)}
          identities={r.identities}
          run={run}
        />
        <div className="stack">
          <Review level="week" periodStart={weekStart} userId={data.userId} review={r.planReviews.find((x) => x.level === 'week' && x.periodStart === weekStart)} run={run} />
          <Review level="month" periodStart={monthStart} userId={data.userId} review={r.planReviews.find((x) => x.level === 'month' && x.periodStart === monthStart)} run={run} />
        </div>
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;

function Identities({ records, run }: { records: OwnerRecords; run: Run }) {
  const [text, setText] = useState('');
  const list = [...records.identities].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <Card title="Who I'm becoming">
      <p className="small muted" style={{ marginTop: 0 }}>
        Each finished task linked to an identity is a vote for it.
      </p>
      <ul className="task-list">
        {list.map((i) => (
          <li key={i.id}>
            <span style={{ flex: 1, opacity: i.isActive ? 1 : 0.6 }}>
              {i.statement} {!i.isActive && <span className="badge">Paused</span>}
            </span>
            <button type="button" className="btn link" onClick={() => void run(() => save<IdentityRecord>('identities', { ...i, isActive: !i.isActive }))}>
              {i.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              type="button"
              className="btn link"
              aria-label={`Delete ${i.statement}`}
              onClick={() => window.confirm(`Delete "${i.statement}"? Linked tasks stay but stop counting as votes.`) && void run(() => remove('identities', i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void run(() =>
            save('identities', { id: newId(), statement: text.trim(), isActive: true, displayOrder: list.length }),
          ).then(() => setText(''));
        }}
      >
        <input type="text" value={text} maxLength={120} placeholder="I am a reader" onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </Card>
  );
}

function Goals({
  level,
  title,
  periodStart,
  goals,
  parents,
  identities,
  run,
}: {
  level: PlanLevel;
  title: string;
  periodStart: string;
  goals: PlanGoalRecord[];
  parents: PlanGoalRecord[];
  identities: IdentityRecord[];
  run: Run;
}) {
  const [text, setText] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [parentId, setParentId] = useState('');
  const active = identities.filter((i) => i.isActive);
  return (
    <Card title={title}>
      <ul className="task-list">
        {[...goals]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((g) => (
            <li key={g.id}>
              <input
                type="checkbox"
                className="big-check"
                checked={!!g.doneAt}
                aria-label={g.text}
                onChange={(e) => void run(() => save('planGoals', { ...g, doneAt: e.target.checked ? new Date().toISOString() : null }))}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, textDecoration: g.doneAt ? 'line-through' : 'none' }}>{g.text}</div>
                <div className="small muted">
                  {[identities.find((i) => i.id === g.identityId)?.statement, parents.find((p) => p.id === g.parentId) && `for "${parents.find((p) => p.id === g.parentId)!.text}"`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <button type="button" className="btn link" aria-label={`Delete ${g.text}`} onClick={() => window.confirm(`Remove "${g.text}"?`) && void run(() => remove('planGoals', g))}>
                ✕
              </button>
            </li>
          ))}
      </ul>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void run(() =>
            save('planGoals', {
              id: newId(),
              level,
              periodStart,
              text: text.trim(),
              identityId: identityId || null,
              parentId: level === 'week' ? parentId || null : null,
              doneAt: null,
              displayOrder: goals.length,
            }),
          ).then(() => setText(''));
        }}
      >
        <input type="text" value={text} maxLength={200} placeholder={level === 'month' ? 'e.g. Finish two books' : 'e.g. Read 100 pages'} onChange={(e) => setText(e.target.value)} style={{ flex: '2 1 180px' }} />
        {active.length > 0 && (
          <select aria-label="Identity" value={identityId} onChange={(e) => setIdentityId(e.target.value)}>
            <option value="">Identity (optional)</option>
            {active.map((i) => (
              <option key={i.id} value={i.id}>
                {i.statement}
              </option>
            ))}
          </select>
        )}
        {level === 'week' && parents.length > 0 && (
          <select aria-label="Monthly focus" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Serves focus (optional)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.text}
              </option>
            ))}
          </select>
        )}
        <button className="btn primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </Card>
  );
}

function Review({ level, periodStart, userId, review, run }: { level: PlanLevel; periodStart: string; userId: string; review: PlanReviewRecord | undefined; run: Run }) {
  const [wentWell, setWentWell] = useState(review?.wentWell ?? '');
  const [makeEasier, setMakeEasier] = useState(review?.makeEasier ?? '');
  const [onePercent, setOnePercent] = useState(review?.onePercent ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setWentWell(review?.wentWell ?? '');
    setMakeEasier(review?.makeEasier ?? '');
    setOnePercent(review?.onePercent ?? '');
  }, [review?.id, review?.updatedAt, review]);
  return (
    <Card title={level === 'week' ? 'Weekly review' : 'Monthly review'}>
      <form
        className="stack"
        style={{ gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            save('planReviews', { id: planReviewId(userId, level, periodStart), level, periodStart, wentWell: wentWell || null, makeEasier: makeEasier || null, onePercent: onePercent || null }),
          ).then(() => setSaved(true));
        }}
      >
        <label className="field">
          What worked?
          <textarea rows={2} value={wentWell} onChange={(e) => (setWentWell(e.target.value), setSaved(false))} />
        </label>
        <label className="field">
          What got in the way? How can I make it easier?
          <textarea rows={2} value={makeEasier} onChange={(e) => (setMakeEasier(e.target.value), setSaved(false))} />
        </label>
        <label className="field">
          How will I get 1% better next {level}?
          <textarea rows={2} value={onePercent} onChange={(e) => (setOnePercent(e.target.value), setSaved(false))} />
        </label>
        <div className="row">
          <button className="btn primary">Save review</button>
          {saved && <span className="small" style={{ color: 'var(--success)' }}>Saved ✓</span>}
        </div>
      </form>
    </Card>
  );
}
