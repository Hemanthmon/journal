import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { formatShortDate, type OutcomeCounts, type UrgeAnalytics } from '@journal/shared';
import { useApi } from '../api';
import { COLORS, ChartBox, DayLines, Legend, OUTCOME_SERIES, shortDate, tick, tooltipStyle } from '../components/charts';
import { DivertedRing, Insights, OutcomeCalendar, TimeHeatmap } from '../components/glance';
import { Card, Empty, ErrorBox, Loading, Outcome, Stat, num, pct, time12, yesNo } from '../components/ui';
import { useRange } from '../range';

function TopList({ items, color, label }: { items: { label: string; count: number }[]; color: string; label: string }) {
  if (items.length === 0) return <Empty>Nothing recorded.</Empty>;
  return (
    <ChartBox label={label} height={Math.max(160, items.length * 34)}>
      <BarChart data={items} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke={COLORS.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={tick} />
        <YAxis type="category" dataKey="label" width={150} tick={tick} />
        <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Times']} />
        <Bar dataKey="count" fill={color} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ChartBox>
  );
}

/** Horizontal stacked bars of outcomes per group, with the diverted rate in each label. */
function OutcomeBars({ items, label }: { items: ({ label: string } & OutcomeCounts)[]; label: string }) {
  const rows = items.filter((i) => i.total > 0);
  if (rows.length === 0) return <Empty>Nothing recorded.</Empty>;
  const rateText = (i: OutcomeCounts) => (i.divertedPercent === null ? 'not answered' : `${Math.round(i.divertedPercent)}% diverted`);
  const data = rows.map((i) => ({ ...i, name: `${i.label} · ${rateText(i)}` }));
  return (
    <>
      <Legend items={OUTCOME_SERIES} />
      <ChartBox label={label} height={Math.max(150, rows.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={COLORS.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={tick} />
          <YAxis type="category" dataKey="name" width={190} tick={tick} />
          <Tooltip {...tooltipStyle} formatter={(v, name) => [v, OUTCOME_SERIES.find((s) => s.key === name)?.label ?? name]} />
          {OUTCOME_SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="o" fill={s.color} stroke="var(--card)" strokeWidth={2} barSize={20} />
          ))}
        </BarChart>
      </ChartBox>
    </>
  );
}

export function Urges() {
  const r = useRange();
  const { data, error, loading } = useApi<UrgeAnalytics>(r.withRange('/urges'));
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;
  const { stats } = data;
  // Every day in the range is plotted; days without urges show as 0.
  const daily = data.daily.map((d) => ({ ...d, intensity: d.avgIntensity ?? 0 }));

  return (
    <div className="stack">
      <h1>Urge tracker</h1>

      <Card title="At a glance">
        <div className="glance">
          <DivertedRing diverted={stats.diverted} notDiverted={stats.notDiverted} unanswered={stats.unanswered} />
          <Insights items={data.insights} />
        </div>
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          An urge counts as <strong>diverted</strong> when the answer to both "Did I watch that content?" and "Did I
          masturbate?" is No. Urges where either wasn't answered are shown separately and left out of the rate.
        </p>
      </Card>

      <Card title="Every day in this period">
        <OutcomeCalendar days={data.daily} search={r.search} />
      </Card>

      <div className="grid stats">
        <Stat label="Total urges" value={stats.total} hint="In this period" />
        <Stat label="Average intensity" value={num(stats.avgIntensity)} hint="Scale 0–10" />
        <Stat label="Average duration" value={stats.avgDuration === null ? '—' : `${num(stats.avgDuration)} min`} hint={`${stats.withDuration} with a duration`} />
        <Stat label="Total duration" value={`${stats.totalDuration} min`} />
      </div>
      <div className="grid stats">
        <Stat
          label="Diverted rate"
          value={pct(stats.divertedPercent)}
          hint={
            stats.diverted + stats.notDiverted
              ? `${stats.diverted} of ${stats.diverted + stats.notDiverted} answered urges`
              : 'No answered urges in this period'
          }
        />
        <Stat
          label="Not diverted rate"
          value={pct(stats.divertedPercent === null ? null : 100 - stats.divertedPercent)}
          hint={
            stats.diverted + stats.notDiverted
              ? `${stats.notDiverted} of ${stats.diverted + stats.notDiverted} answered urges`
              : 'No answered urges in this period'
          }
        />
        <Stat label="Diverted" value={stats.diverted} hint="Didn't watch, didn't masturbate" />
        <Stat
          label="Not diverted"
          value={stats.notDiverted}
          hint={stats.unanswered ? `Watched or masturbated · ${stats.unanswered} not answered` : 'Watched or masturbated'}
        />
        <Stat
          label="Diverted in a row"
          value={data.currentDivertedStreak}
          hint={`Best in this period: ${data.bestDivertedStreak}`}
        />
      </div>

      <Card title="Diverted vs not diverted, day by day">
        <DayLines
          data={data.daily}
          series={OUTCOME_SERIES.slice(0, 2)}
          label="Number of diverted and not diverted urges on each day, 0 on days without"
          height={280}
          labelFormat={(d, p) => {
            const day = p as UrgeAnalytics['daily'][number] | undefined;
            const answered = day ? day.diverted + day.notDiverted : 0;
            if (!day?.count) return `${shortDate(d)} · no urges`;
            const rate = answered ? ` · ${Math.round((day.diverted / answered) * 100)}% diverted` : ' · not answered';
            return `${shortDate(d)} · ${day.count} urge${day.count === 1 ? '' : 's'}${rate}`;
          }}
        />
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Each dot is <strong>one day only</strong>: the blue line is how many urges were diverted that day, the orange
          line how many were not. Days with no urges sit at 0. Blue above orange = a good day. Hover a dot for the
          day's percentage.
        </p>
      </Card>

      <div className="grid two">
        <Card title="Diverted urges per day">
          <DayLines
            data={data.daily}
            series={[OUTCOME_SERIES[0]]}
            label="Diverted urges per day, 0 on days without"
          />
        </Card>
        <Card title="Not diverted urges per day">
          <DayLines
            data={data.daily}
            series={[OUTCOME_SERIES[1]]}
            label="Not diverted urges per day, 0 on days without"
          />
        </Card>
        <Card title="Diverted vs not diverted, per week">
          <DayLines
            data={data.weekly}
            xKey="weekStart"
            xFormat={(d) => `wk ${shortDate(d)}`}
            series={OUTCOME_SERIES.slice(0, 2)}
            label="Diverted and not diverted urges per week, 0 in weeks without"
            labelFormat={(d, p) => {
              const w = p as UrgeAnalytics['weekly'][number] | undefined;
              const rate = w && w.divertedPercent !== null ? ` · ${Math.round(w.divertedPercent)}% diverted` : '';
              return `Week of ${shortDate(d)}${rate}`;
            }}
          />
        </Card>
        <Card title="When not diverted">
          {stats.notDiverted === 0 ? (
            <Empty>{stats.diverted ? 'Every answered urge in this period was diverted.' : 'Nothing recorded.'}</Empty>
          ) : (
            <TopList
              items={[
                { label: 'Watched content only', count: data.notDivertedBreakdown.watchedOnly },
                { label: 'Masturbated only', count: data.notDivertedBreakdown.masturbatedOnly },
                { label: 'Both', count: data.notDivertedBreakdown.both },
              ]}
              color={COLORS.notDiverted}
              label="What happened when an urge was not diverted"
            />
          )}
        </Card>
      </div>

      <h2 style={{ margin: '8px 0 0' }}>Patterns</h2>
      <Card title="When urges happen">
        <TimeHeatmap cells={data.timeOfDay} />
      </Card>

      <div className="grid two">
        <Card title="Diverted by intensity">
          <OutcomeBars items={data.byIntensity} label="Diverted and not diverted urges by intensity level" />
        </Card>
        <Card title="Diverted by trigger">
          <OutcomeBars items={data.triggerOutcomes} label="Diverted and not diverted urges for the most common triggers" />
        </Card>
      </div>

      <h2 style={{ margin: '8px 0 0' }}>Frequency, intensity and duration</h2>
      <div className="grid two">
        <Card title="Urges per day">
          <DayLines
            data={data.daily}
            series={[{ key: 'count', label: 'Urges', color: COLORS.primary }]}
            label="Number of urges per day, 0 on days without"
          />
        </Card>
        <Card title="Average intensity per day">
          <DayLines
            data={daily}
            series={[{ key: 'intensity', label: 'Average intensity', color: COLORS.primary }]}
            label="Average urge intensity per day, 0 on days without urges"
            yDomain={[0, 10]}
            allowDecimals
            valueFormat={(v, _k, p) => (p.count ? String(v) : '0 (no urges)')}
          />
        </Card>
        <Card title="Time spent on urges per day">
          <DayLines
            data={daily}
            series={[{ key: 'totalDuration', label: 'Total duration', color: COLORS.violet }]}
            label="Total urge duration in minutes per day, 0 on days without urges"
            yUnit=" min"
            valueFormat={(v) => `${v} min`}
          />
        </Card>
        <Card title="Common triggers">
          <TopList items={data.triggers} color={COLORS.warm} label="Most common triggers" />
        </Card>
        <Card title="Emotions before urges">
          <TopList items={data.emotions} color={COLORS.violet} label="Most common emotions before urges" />
        </Card>
      </div>

      <Card title={`All records (${data.records.length})`}>
        {data.records.length === 0 ? (
          <Empty>No urges recorded in this period.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th>Intensity</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                  <th>Trigger</th>
                  <th>Emotion before</th>
                  <th>What I did</th>
                  <th>What happened after</th>
                  <th>Masturbated</th>
                  <th>Watched content</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((u) => (
                  <tr key={u.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link to={{ pathname: `/day/${u.localDate}`, search: r.search }}>{formatShortDate(u.localDate)}</Link>
                      <div className="small muted">
                        {u.weekday.slice(0, 3)} · {time12(u.localTime)}
                      </div>
                    </td>
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
    </div>
  );
}
