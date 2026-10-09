import { useState } from 'react';
import { addDays, formatLongDate, formatShortDate, type DashboardPlanner, type PlannerGoal } from '@journal/shared';
import { useApi } from '../api';
import { PlannerEditor } from '../owner/PlannerEditor';
import { useMe } from '../session';
import { Card, Empty, ErrorBox, Loading, Progress, Stat, time12 } from '../components/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (start: string) => `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
const ratio = (done: number, total: number) => (total ? (done / total) * 100 : null);

function GoalList({ goals, empty }: { goals: PlannerGoal[]; empty: string }) {
  if (goals.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="stack" style={{ gap: 14 }}>
      {goals.map((g, i) => (
        <div key={i}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <strong style={{ textDecoration: g.done ? 'line-through' : 'none' }}>
              {g.done ? '✅' : '🎯'} {g.text}
            </strong>
            {g.tasks > 0 && (
              <span className={`badge${g.tasksDone === g.tasks ? ' active' : ''}`}>
                {g.tasksDone}/{g.tasks}
              </span>
            )}
          </div>
          {(g.identity || g.focus) && (
            <div className="small muted">
              {g.identity && <>🪪 {g.identity}</>}
              {g.identity && g.focus && ' · '}
              {g.focus && <>for “{g.focus}”</>}
            </div>
          )}
          {g.weeklyGoals.length > 0 && (
            <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 22 }}>
              {g.weeklyGoals.map((w, j) => (
                <li key={j} style={{ textDecoration: w.done ? 'line-through' : 'none' }}>
                  {w.text}
                </li>
              ))}
            </ul>
          )}
          {g.tasks > 0 && (
            <div style={{ marginTop: 6 }}>
              <Progress percent={ratio(g.tasksDone, g.tasks)} label={`${g.text}: tasks done`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Planner() {
  const [date, setDate] = useState<string | null>(null);
  const me = useMe();
  const { data, error, reload } = useApi<DashboardPlanner>(`/planner${date ? `?date=${date}` : ''}`);
  if (error) return <ErrorBox message={error} />;
  // Keep showing the current plan while it refreshes, so edits below aren't interrupted.
  if (!data) return <Loading />;
  const { week, month } = data;
  const isCurrent = week.start <= data.today && data.today <= week.end;
  const maxVotes = Math.max(1, ...data.identities.map((i) => i.monthVotes));

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Planner</h1>
        <div className="row">
          <button className="btn" type="button" onClick={() => setDate(addDays(week.start, -7))} aria-label="Previous week">
            ←
          </button>
          <strong>
            {formatShortDate(week.start)} – {formatShortDate(week.end)}
          </strong>
          <button className="btn" type="button" onClick={() => setDate(addDays(week.start, 7))} aria-label="Next week">
            →
          </button>
          {!isCurrent && (
            <button className="btn" type="button" onClick={() => setDate(null)}>
              This week
            </button>
          )}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Built on Atomic Habits: each finished task is a vote for who they're becoming. Monthly focuses break into weekly goals,
        and weekly goals into daily tasks.
      </p>

      <div className="grid stats">
        <Stat label="Tasks done this week" value={`${week.tasksDone}/${week.tasks}`} hint={<Progress percent={ratio(week.tasksDone, week.tasks)} />} />
        <Stat label={`Tasks done in ${MONTHS[Number(month.start.slice(5, 7)) - 1]}`} value={`${month.tasksDone}/${month.tasks}`} hint={<Progress percent={ratio(month.tasksDone, month.tasks)} />} />
        <Stat label="Weekly goals reached" value={`${week.goals.filter((g) => g.done).length}/${week.goals.length}`} />
        <Stat label="Identity votes this week" value={data.identities.reduce((s, i) => s + i.weekVotes, 0)} />
      </div>

      {data.missedYesterday.length > 0 && (
        <Card title="Never miss twice">
          <p className="small muted" style={{ marginTop: 0 }}>
            Not finished yesterday. Missing once is an accident; today is the chance to get back on track.
          </p>
          <ul style={{ margin: 0 }}>
            {data.missedYesterday.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid two">
        <Card title="Who they're becoming">
          {data.identities.length === 0 ? (
            <Empty>No identities yet.</Empty>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {data.identities.map((i) => (
                <div key={i.id}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <span>
                      {i.statement} {!i.active && <span className="badge">Paused</span>}
                    </span>
                    <strong title="This week · this month · all time" style={{ whiteSpace: 'nowrap' }}>
                      {i.weekVotes} · {i.monthVotes} · {i.totalVotes}
                    </strong>
                  </div>
                  <Progress percent={(i.monthVotes / maxVotes) * 100} label={`${i.statement}: votes this month`} />
                </div>
              ))}
              <div className="small muted">Votes: this week · this month · all time</div>
            </div>
          )}
        </Card>
        <Card title={`Monthly focus · ${monthName(month.start)}`}>
          <GoalList goals={month.focuses} empty="No monthly focus set." />
        </Card>
      </div>

      <Card title="Weekly goals">
        <GoalList goals={week.goals} empty="No weekly goals set." />
      </Card>

      <Card title="This week, day by day">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Day</th>
                <th>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td>
                    <strong>{d.weekday}</strong>
                    {d.date === data.today && <span className="badge active" style={{ marginLeft: 6 }}>Today</span>}
                    <div className="small muted">{formatShortDate(d.date)}</div>
                  </td>
                  <td>
                    {d.tasks.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                        {d.tasks.map((t, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>
                            <span aria-label={t.done ? 'Done' : 'Not done'}>{t.done ? '✅' : '⬜'}</span>{' '}
                            <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                            <div className="small muted" style={{ marginLeft: 24 }}>
                              {[t.identity && `🪪 ${t.identity}`, (t.time || t.place) && `📍 ${[time12(t.time), t.place].filter(Boolean).join(' · ')}`, t.twoMinute && `⏱ ${t.twoMinute}`]
                                .filter(Boolean)
                                .join('   ')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Reviews">
        {data.reviews.length === 0 ? (
          <Empty>No weekly or monthly reviews yet.</Empty>
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {data.reviews.map((r) => (
              <div key={`${r.level}${r.periodStart}`}>
                <strong>{r.level === 'month' ? monthName(r.periodStart) : `Week of ${formatLongDate(r.periodStart)}`}</strong>
                {r.wentWell && (
                  <div>
                    <span className="small muted">What worked: </span>
                    {r.wentWell}
                  </div>
                )}
                {r.makeEasier && (
                  <div>
                    <span className="small muted">Make it easier: </span>
                    {r.makeEasier}
                  </div>
                )}
                {r.onePercent && (
                  <div>
                    <span className="small muted">1% better: </span>
                    {r.onePercent}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {me.isOwner && (
        <PlannerEditor
          key={week.start}
          weekStart={week.start}
          weekEnd={week.end}
          monthStart={month.start}
          monthEnd={month.end}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}
