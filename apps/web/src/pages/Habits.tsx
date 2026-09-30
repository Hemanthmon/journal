import { useNavigate } from 'react-router';
import { MEASUREMENT_LABELS, weekdayName, type HabitSummary, type ResolvedRange } from '@journal/shared';
import { useApi } from '../api';
import { Card, Empty, ErrorBox, Loading, Progress, pct } from '../components/ui';
import { useRange } from '../range';

export function scheduleText(days: number[]) {
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Mon–Fri';
  if (days.join() === '1,2,3,4,5,6') return 'Mon–Sat';
  return days.map((d) => weekdayName(d)).join(', ');
}

export function targetText(h: Pick<HabitSummary, 'type' | 'target' | 'unit'>) {
  return h.type === 'boolean' ? 'Yes / No' : `${h.target} ${h.unit ?? ''}`.trim();
}

const STATUS_LABEL: Record<HabitSummary['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
  deleted: 'Removed',
};

export function Habits() {
  const r = useRange();
  const nav = useNavigate();
  const { data, error, loading } = useApi<{ range: ResolvedRange; habits: HabitSummary[] }>(r.withRange('/habits'));
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;

  return (
    <div className="stack">
      <h1>Habits</h1>
      <Card>
        {data.habits.length === 0 ? (
          <Empty>No habits yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Habit</th>
                  <th>Target</th>
                  <th>Schedule</th>
                  <th>Completed</th>
                  <th>Not completed</th>
                  <th style={{ minWidth: 160 }}>Completion</th>
                </tr>
              </thead>
              <tbody>
                {data.habits.map((h) => (
                  <tr
                    key={h.id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => nav({ pathname: `/habits/${h.id}`, search: r.search })}
                    onKeyDown={(e) => e.key === 'Enter' && nav({ pathname: `/habits/${h.id}`, search: r.search })}
                  >
                    <td>
                      <strong>{h.name}</strong>{' '}
                      <span className={`badge${h.status === 'active' ? ' active' : ''}`}>{STATUS_LABEL[h.status]}</span>
                      <div className="small muted">{MEASUREMENT_LABELS[h.type]}</div>
                    </td>
                    <td>{targetText(h)}</td>
                    <td>{scheduleText(h.scheduleDays)}</td>
                    <td>{h.completedDays}</td>
                    <td>{h.incompleteDays}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <div style={{ flex: 1 }}>
                          <Progress percent={h.completionPercent} label={`${h.name} completion`} />
                        </div>
                        <span style={{ minWidth: 42, textAlign: 'right' }}>{pct(h.completionPercent)}</span>
                      </div>
                      <div className="small muted">{h.scheduledDays} scheduled day{h.scheduledDays === 1 ? '' : 's'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted">
        Completion counts only the days each habit was scheduled. Days it wasn't scheduled are never counted.
      </p>
    </div>
  );
}
