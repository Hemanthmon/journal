import { Link, useParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MEASUREMENT_LABELS, formatShortDate, weekdayOf, type HabitDetail, type ResolvedRange } from '@journal/shared';
import { useApi } from '../api';
import { COLORS, ChartBox, shortDate, tick, tooltipStyle } from '../components/charts';
import { Card, Empty, ErrorBox, Loading, Stat, pct } from '../components/ui';
import { useRange } from '../range';
import { scheduleText, targetText } from './Habits';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Calendar({ days, rangeSearch }: { days: HabitDetail['calendar']; rangeSearch: string }) {
  if (days.length === 0) return <Empty>No days in this period.</Empty>;
  const lead = weekdayOf(days[0]!.date) - 1; // Monday-first grid
  return (
    <div>
      <div className="calendar" style={{ marginBottom: 6 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="cal-head">
            {d}
          </div>
        ))}
      </div>
      <div className="calendar">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {days.map((d) => {
          const cls = !d.scheduled ? 'off' : (d.progress ?? 0) >= 100 ? 'done' : (d.progress ?? 0) > 0 ? 'partial' : 'missed';
          const desc = !d.scheduled
            ? 'not scheduled'
            : `${Math.round(d.progress ?? 0)}%${d.value !== null && d.target !== null ? ` (${d.value} of ${d.target})` : ''}`;
          return (
            <Link
              key={d.date}
              to={{ pathname: `/day/${d.date}`, search: rangeSearch }}
              className={`cal-day ${cls}`}
              title={`${formatShortDate(d.date)}: ${desc}`}
              aria-label={`${formatShortDate(d.date)}: ${desc}`}
              style={{ textDecoration: 'none' }}
            >
              {Number(d.date.slice(8))}
            </Link>
          );
        })}
      </div>
      <p className="small muted">Green: complete · Blue: partly done · Grey: scheduled, not done · Dashed: not scheduled</p>
    </div>
  );
}

export function HabitDetailPage() {
  const { id } = useParams();
  const r = useRange();
  const { data, error, loading } = useApi<{ range: ResolvedRange; habit: HabitDetail }>(
    id ? r.withRange(`/habits/${id}`) : null,
  );
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;
  const h = data.habit;

  return (
    <div className="stack">
      <div>
        <Link to={{ pathname: '/habits', search: r.search }} className="small">
          ← All habits
        </Link>
        <h1 style={{ marginTop: 6 }}>{h.name}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {MEASUREMENT_LABELS[h.type]} · Target {targetText(h)} · {scheduleText(h.scheduleDays)}
          {h.description ? ` · ${h.description}` : ''}
        </p>
      </div>

      <div className="grid stats">
        <Stat label="Completion" value={pct(h.completionPercent)} hint="Of scheduled days" />
        <Stat label="Completed days" value={h.completedDays} />
        <Stat label="Not completed" value={h.incompleteDays} />
        <Stat label="Scheduled days" value={h.scheduledDays} />
      </div>

      <div className="grid two">
        <Card title="Weekly progress">
          {h.weekly.length === 0 ? (
            <Empty>Not scheduled in this period.</Empty>
          ) : (
            <ChartBox label="Completion percentage per week">
              <BarChart data={h.weekly}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="weekStart" tickFormatter={(d: string) => `wk ${shortDate(d)}`} tick={tick} minTickGap={12} />
                <YAxis domain={[0, 100]} unit="%" tick={tick} width={44} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(d) => `Week of ${shortDate(String(d))}`}
                  formatter={(v, _n, p) => [`${v}% (${p.payload.completed}/${p.payload.scheduled})`, 'Completed']}
                />
                <Bar dataKey="percent" fill={COLORS.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartBox>
          )}
        </Card>
        <Card title="Monthly progress">
          {h.monthly.length === 0 ? (
            <Empty>Not scheduled in this period.</Empty>
          ) : (
            <ChartBox label="Completion percentage per month">
              <BarChart data={h.monthly}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={tick} />
                <YAxis domain={[0, 100]} unit="%" tick={tick} width={44} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(m) => monthLabel(String(m))}
                  formatter={(v, _n, p) => [`${v}% (${p.payload.completed}/${p.payload.scheduled})`, 'Completed']}
                />
                <Bar dataKey="percent" fill={COLORS.success} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartBox>
          )}
        </Card>
      </div>

      <Card title="History">
        <Calendar days={h.calendar} rangeSearch={r.search} />
      </Card>
    </div>
  );
}
