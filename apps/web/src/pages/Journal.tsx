import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatShortDate, type DaySummary, type ResolvedRange } from '@journal/shared';
import { useApi } from '../api';
import { Card, Empty, ErrorBox, Loading, Mood, pct } from '../components/ui';
import { useRange } from '../range';

export function Journal() {
  const r = useRange();
  const nav = useNavigate();
  const [pick, setPick] = useState(r.today);
  const { data, error, loading } = useApi<{ range: ResolvedRange; days: DaySummary[] }>(r.withRange('/days'));
  const open = (date: string) => nav({ pathname: `/day/${date}`, search: r.search });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Daily routine &amp; journal</h1>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) open(pick);
          }}
        >
          <label className="small muted">
            Open a date <input type="date" value={pick} max={r.today} onChange={(e) => setPick(e.target.value)} />
          </label>
          <button className="btn">Open</button>
        </form>
      </div>
      {error && <ErrorBox message={error} />}
      {loading || !data ? (
        !error && <Loading />
      ) : (
        <Card>
          {data.days.length === 0 ? (
            <Empty>Nothing recorded in this period.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Habits</th>
                    <th>Mood</th>
                    <th>Journal answers</th>
                    <th>Urges</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr
                      key={d.date}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => open(d.date)}
                      onKeyDown={(e) => e.key === 'Enter' && open(d.date)}
                    >
                      <td>
                        <strong>{formatShortDate(d.date)}</strong>
                        <div className="small muted">{d.weekday}</div>
                      </td>
                      <td>
                        {d.habitsScheduled ? `${d.habitsCompleted}/${d.habitsScheduled} · ${pct(d.habitPercent)}` : <span className="muted">—</span>}
                      </td>
                      <td>
                        <Mood value={d.mood} />
                      </td>
                      <td>{d.answered || <span className="muted">—</span>}</td>
                      <td>{d.urges || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
