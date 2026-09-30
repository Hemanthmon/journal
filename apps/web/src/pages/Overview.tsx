import { Link } from 'react-router';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { MOOD_OPTIONS, formatShortDate, type DashboardOverview } from '@journal/shared';
import { useApi } from '../api';
import { COLORS, ChartBox, DayLines, shortDate, tick, tooltipStyle } from '../components/charts';
import { Card, Empty, ErrorBox, Loading, Mood, Progress, Stat, num, pct, time12 } from '../components/ui';
import { useRange } from '../range';
import {
  DivertedRing,
  HabitCalendar,
  HabitRing,
  Insights,
  MoodBars,
  MoodCalendar,
  MoodHero,
  OutcomeCalendar,
  PercentBars,
} from '../components/glance';

const KIND_COLOR ={ urge: COLORS.warm, journal: COLORS.violet, habit: COLORS.success } as const;

export function Overview() {
  const r = useRange();
  const { data, error, loading } = useApi<DashboardOverview>(r.withRange('/overview'));
  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading />;
  const { today, habits, journal, mood, urges, series, recent } = data;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Overview</h1>
        <span className="muted small">
          {formatShortDate(data.range.from)} – {formatShortDate(data.range.to)} · {data.range.days} day{data.range.days === 1 ? '' : 's'}
        </span>
      </div>

      <Card title="Urges at a glance">
        <div className="glance">
          <DivertedRing diverted={urges.diverted} notDiverted={urges.notDiverted} unanswered={urges.unanswered} />
          <Insights
            items={data.urgeInsights.slice(0, 4)}
            more={{ to: '/urges', search: r.search, label: 'See all urge patterns' }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <OutcomeCalendar
            search={r.search}
            days={series.map((s) => ({
              date: s.date,
              count: s.urges,
              diverted: s.urgesDiverted,
              notDiverted: s.urgesNotDiverted,
              unanswered: s.urgesUnanswered,
            }))}
          />
        </div>
      </Card>

      <Card title="Habits at a glance">
        <div className="glance">
          <HabitRing completed={habits.completedHabitDays} scheduled={habits.scheduledHabitDays} />
          <Insights
            items={data.habitInsights}
            more={{ to: '/habits', search: r.search, label: 'See every habit' }}
          />
        </div>
        <div className="grid two" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sub">Completion per habit</h3>
            <PercentBars
              color={COLORS.success}
              search={r.search}
              items={data.habitBreakdown.map((h) => ({
                id: h.id,
                name: h.name,
                percent: h.completionPercent,
                detail: `${h.completedDays}/${h.scheduledDays} days`,
                to: `/habits/${h.id}`,
              }))}
            />
          </div>
          <div>
            <h3 className="sub">Every day</h3>
            <HabitCalendar search={r.search} days={series} />
          </div>
        </div>
      </Card>

      <Card title="Mood at a glance">
        <div className="glance">
          <MoodHero average={mood.average} days={data.range.days} recorded={series.filter((s) => s.mood !== null).length} />
          <Insights items={data.moodInsights} />
        </div>
        <div className="grid two" style={{ marginTop: 16 }}>
          <div>
            <h3 className="sub">How often each mood was felt</h3>
            <MoodBars counts={data.moodCounts} />
          </div>
          <div>
            <h3 className="sub">Every day</h3>
            <MoodCalendar search={r.search} days={series} />
          </div>
        </div>
      </Card>

      <div className="grid stats">
        <Stat
          label="Today's habits"
          value={today.scheduled ? `${today.completed}/${today.scheduled}` : '—'}
          hint={today.scheduled ? `${pct(today.percent)} complete` : 'Nothing scheduled today'}
        />
        <Stat
          label="Completed habits"
          value={habits.completedHabitDays}
          hint={`of ${habits.scheduledHabitDays} scheduled in this period`}
        />
        <Stat label="Routine completion" value={pct(habits.routinePercent)} hint="Average progress on scheduled habits" />
        <Stat
          label="Journal"
          value={today.journalAnswered > 0 ? 'Written today' : 'Not yet today'}
          hint={`${journal.daysWritten} of ${journal.days} days in this period`}
        />
        <Stat
          label="Current mood"
          value={<Mood value={today.mood ?? mood.latest} />}
          hint={
            today.mood !== null
              ? 'Today'
              : mood.latestDate
                ? `Last recorded ${formatShortDate(mood.latestDate)}`
                : 'Not recorded'
          }
        />
        <Stat label="Urges recorded" value={urges.total} hint="In this period" />
        <Stat
          label="Urges diverted"
          value={pct(urges.divertedPercent)}
          hint={
            urges.diverted + urges.notDiverted
              ? `${urges.diverted} of ${urges.diverted + urges.notDiverted} answered urges`
              : 'No answered urges in this period'
          }
        />
        <Stat label="Average intensity" value={num(urges.avgIntensity)} hint="Scale 0–10" />
        <Stat
          label="Average duration"
          value={urges.avgDuration === null ? '—' : `${num(urges.avgDuration)} min`}
          hint={urges.withDuration ? `From ${urges.withDuration} record${urges.withDuration === 1 ? '' : 's'} with a duration` : 'No durations recorded'}
        />
      </div>

      <div className="grid two">
        <Card title="Habit completion by day">
          <DayLines
            data={series.map((s) => ({ ...s, habitLine: s.habitPercent ?? 0 }))}
            series={[{ key: 'habitLine', label: 'Completion', color: COLORS.success }]}
            label="Average habit completion per day, 0 on days with nothing scheduled"
            yDomain={[0, 100]}
            yUnit="%"
            valueFormat={(v, _k, p) => (p.habitPercent === null ? 'Nothing scheduled' : `${Math.round(v)}%`)}
          />
        </Card>
        <Card title="Mood">
          {series.some((s) => s.mood !== null) ? (
            <ChartBox label="Mood per day, 1 very sad to 5 great">
              <LineChart data={series}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={tick} minTickGap={16} />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tickFormatter={(v: number) => MOOD_OPTIONS.find((m) => m.value === v)?.emoji ?? ''}
                  tick={{ fontSize: 16 }}
                  width={36}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(d) => shortDate(String(d))}
                  formatter={(v) => {
                    const m = MOOD_OPTIONS.find((o) => o.value === v);
                    return [m ? `${m.emoji} ${m.label}` : '—', 'Mood'];
                  }}
                />
                <Line type="monotone" dataKey="mood" stroke={COLORS.violet} strokeWidth={2} connectNulls dot={{ r: 4, fill: COLORS.violet, stroke: "var(--card)", strokeWidth: 1.5 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ChartBox>
          ) : (
            <Empty>No mood recorded in this period.</Empty>
          )}
        </Card>
        <Card title="Urges per day">
          <DayLines
            data={series}
            series={[
              { key: 'urgesDiverted', label: 'Diverted', color: COLORS.diverted },
              { key: 'urgesNotDiverted', label: 'Not diverted', color: COLORS.notDiverted },
            ]}
            label="Diverted and not diverted urges per day, 0 on days without"
            labelFormat={(d, p) => {
              const s = p as (typeof series)[number] | undefined;
              if (!s?.urges) return `${shortDate(d)} · no urges`;
              const extra = s.urgesUnanswered ? ` · ${s.urgesUnanswered} not answered` : '';
              return `${shortDate(d)} · ${s.urges} urge${s.urges === 1 ? '' : 's'}${extra}`;
            }}
          />
        </Card>
        <Card title="Recent activity">
          {recent.length === 0 ? (
            <Empty>No activity in this period.</Empty>
          ) : (
            <ul className="activity">
              {recent.map((a, i) => (
                <li key={i}>
                  <span className="dot" style={{ background: KIND_COLOR[a.kind] }} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <Link to={{ pathname: `/day/${a.date}`, search: r.search }}>
                      <strong>{a.title}</strong>
                    </Link>
                    <div className="small muted">
                      {formatShortDate(a.date)}
                      {a.time ? ` · ${time12(a.time)}` : ''}
                    </div>
                    {a.detail && (
                      <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.detail}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {today.scheduled > 0 && (
        <Card title="Today at a glance">
          <Progress percent={today.percent} label="Today's habit completion" />
          <p className="small muted" style={{ marginBottom: 0 }}>
            {today.completed} of {today.scheduled} habits complete ·{' '}
            <Link to={{ pathname: `/day/${today.date}`, search: r.search }}>Open today</Link>
          </p>
        </Card>
      )}
    </div>
  );
}
