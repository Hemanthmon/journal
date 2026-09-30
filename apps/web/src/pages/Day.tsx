import { Link, useParams } from 'react-router';
import { addDays, formatLongDate, type DayDetail } from '@journal/shared';
import { useApi } from '../api';
import { Card, Empty, ErrorBox, Loading, Mood, Outcome, Progress, pct, time12, yesNo } from '../components/ui';
import { useRange } from '../range';

export function Day() {
  const { date = '' } = useParams();
  const r = useRange();
  const { data, error, loading } = useApi<DayDetail>(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `/days/${date}` : null);
  const go = (d: string) => ({ pathname: `/day/${d}`, search: r.search });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <Link to={{ pathname: '/journal', search: r.search }} className="small">
            ← All days
          </Link>
          <h1 style={{ marginTop: 6 }}>{/^\d{4}-\d{2}-\d{2}$/.test(date) ? formatLongDate(date) : 'Day'}</h1>
        </div>
        <div className="row">
          <Link className="btn" to={go(addDays(date, -1))} style={{ textDecoration: 'none' }}>
            ← Previous day
          </Link>
          {date < r.today && (
            <Link className="btn" to={go(addDays(date, 1))} style={{ textDecoration: 'none' }}>
              Next day →
            </Link>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {(loading || !data) && !error ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid two">
            <Card title="Habits" right={data.habits.length ? <span className="muted">{pct(data.habitPercent)}</span> : undefined}>
              {data.habits.length === 0 ? (
                <Empty>No habits scheduled this day.</Empty>
              ) : (
                <div className="stack" style={{ gap: 12 }}>
                  {data.habits.map((h) => (
                    <div key={h.habitId}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span>
                          {h.completed ? '✓ ' : ''}
                          <strong>{h.name}</strong>
                        </span>
                        <span className="small muted">
                          {h.type === 'boolean' ? (h.completed ? 'Done' : 'Not done') : `${h.value} / ${h.target} ${h.unit ?? ''}`}
                        </span>
                      </div>
                      <Progress percent={h.progress} label={`${h.name} progress`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Mood & reflection">
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <div className="question">Mood</div>
                  <span style={{ fontSize: 22 }}>
                    <Mood value={data.mood} withLabel />
                  </span>
                </div>
                <div>
                  <div className="question">What I could improve tomorrow</div>
                  {data.improveTomorrow ? <div className="answer">{data.improveTomorrow}</div> : <span className="muted">—</span>}
                </div>
                <div>
                  <div className="question">What I'm grateful for</div>
                  {data.grateful ? <div className="answer">{data.grateful}</div> : <span className="muted">—</span>}
                </div>
              </div>
            </Card>
          </div>

          <Card title="Journal">
            {data.answers.length === 0 ? (
              <Empty>No journal entries this day.</Empty>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {data.answers.map((a) => (
                  <div key={a.questionId}>
                    <div className="question">{a.question}</div>
                    {a.type === 'emoji' ? (
                      <span style={{ fontSize: 22 }}>
                        <Mood value={a.emojiValue} withLabel />
                      </span>
                    ) : (
                      <div className="answer">{a.textValue}</div>
                    )}
                  </div>
                ))}
                <p className="small muted" style={{ margin: 0 }}>
                  Questions are shown exactly as they were worded when answered.
                </p>
              </div>
            )}
          </Card>

          <Card title={`Urges (${data.urges.length})`}>
            {data.urges.length === 0 ? (
              <Empty>No urges recorded this day.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Intensity</th>
                      <th>Duration</th>
                      <th>Outcome</th>
                      <th>Trigger</th>
                      <th>Emotion before</th>
                      <th>What I did</th>
                      <th>After</th>
                      <th>Masturbated</th>
                      <th>Watched content</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.urges.map((u) => (
                      <tr key={u.id}>
                        <td>{time12(u.localTime)}</td>
                        <td>{u.intensity}</td>
                        <td>{u.durationMinutes === null ? '—' : `${u.durationMinutes} min`}</td>
                        <td><Outcome diverted={u.diverted} /></td>
                        <td>{u.triggerText ?? '—'}</td>
                        <td>{u.emotionBefore ?? '—'}</td>
                        <td>{u.actionTaken ?? '—'}</td>
                        <td>{u.outcome ?? '—'}</td>
                        <td>{yesNo(u.masturbated)}</td>
                        <td>{yesNo(u.explicitContent)}</td>
                        <td>{u.remarks ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
