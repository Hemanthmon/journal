import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  MOOD_OPTIONS,
  TIME_BLOCKS,
  formatShortDate,
  weekdayName,
  weekdayOf,
  type OutcomeCounts,
} from '@journal/shared';
import { COLORS, Legend } from './charts';

/**
 * "At a glance" visuals: ring gauges, day calendars, the time-of-day heatmap and
 * plain-language insights. Each has a text equivalent (labels, hover details,
 * aria-labels), so colour is never the only carrier of meaning.
 */

// ------------------------------------------------------------------ ring gauge

export function Ring({
  segments,
  value,
  unit,
  caption,
  label,
  size = 168,
}: {
  /** Fractions 0..1 drawn clockwise from the top; the rest of the ring is the track. */
  segments: { fraction: number; color: string }[];
  value: ReactNode;
  unit: string;
  caption: ReactNode;
  label: string;
  size?: number;
}) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = segments.filter((s) => s.fraction > 0);
  // A small surface gap between adjacent arcs when more than one is drawn.
  const gap = shown.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-alt)" strokeWidth={stroke} />
          {shown.map((s, i) => {
            const len = Math.max(0, s.fraction * c - gap);
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c}`}
                strokeDashoffset={-offset}
                className="ring-arc"
              />
            );
            offset += s.fraction * c;
            return el;
          })}
        </g>
      </svg>
      <div className="ring-center" style={{ height: size }}>
        <div className="ring-value">{value}</div>
        <div className="ring-label">{unit}</div>
      </div>
      <div className="ring-caption">{caption}</div>
    </div>
  );
}

/** Diverted and not diverted as two arcs, with both counts and percentages spelled out. */
export function DivertedRing({ diverted, notDiverted, unanswered = 0 }: { diverted: number; notDiverted: number; unanswered?: number }) {
  const answered = diverted + notDiverted;
  const dp = answered ? Math.round((diverted / answered) * 100) : null;
  const np = dp === null ? null : 100 - dp;
  return (
    <Ring
      segments={
        answered
          ? [
              { fraction: diverted / answered, color: COLORS.diverted },
              { fraction: notDiverted / answered, color: COLORS.notDiverted },
            ]
          : []
      }
      value={dp === null ? '—' : `${dp}%`}
      unit="diverted"
      label={
        answered
          ? `${diverted} diverted (${dp}%) and ${notDiverted} not diverted (${np}%) of ${answered} answered urges`
          : 'No answered urges in this period'
      }
      caption={
        answered ? (
          <div className="ring-split">
            <span>
              <i style={{ background: COLORS.diverted }} /> Diverted <strong>{diverted}</strong> ({dp}%)
            </span>
            <span>
              <i style={{ background: COLORS.notDiverted }} /> Not diverted <strong>{notDiverted}</strong> ({np}%)
            </span>
            {unanswered > 0 && (
              <span>
                <i style={{ background: COLORS.unanswered }} /> Not answered <strong>{unanswered}</strong>
              </span>
            )}
          </div>
        ) : (
          'No answered urges yet'
        )
      }
    />
  );
}

export function HabitRing({ completed, scheduled }: { completed: number; scheduled: number }) {
  const p = scheduled ? completed / scheduled : null;
  return (
    <Ring
      segments={p === null ? [] : [{ fraction: p, color: COLORS.success }]}
      value={p === null ? '—' : `${Math.round(p * 100)}%`}
      unit="completed"
      label={p === null ? 'No habits scheduled' : `${completed} of ${scheduled} scheduled habit-days completed`}
      caption={p === null ? 'No habits scheduled' : `${completed} of ${scheduled} scheduled habit-days`}
    />
  );
}

// ------------------------------------------------------------------ mood

const GOOD = '47, 158, 118'; // success green, as r,g,b
const LOW = '200, 112, 42'; // orange
/** Diverging mood scale: low = orange, okay = neutral grey, good = green. */
export const MOOD_COLOR: Record<number, string> = {
  1: `rgb(${LOW})`,
  2: `rgba(${LOW}, 0.55)`,
  3: COLORS.unanswered,
  4: `rgba(${GOOD}, 0.55)`,
  5: `rgb(${GOOD})`,
};

export function MoodHero({ average, days, recorded }: { average: number | null; days: number; recorded: number }) {
  const m = average === null ? undefined : MOOD_OPTIONS.find((o) => o.value === Math.round(average));
  return (
    <div className="mood-hero" role="img" aria-label={m ? `Average mood ${m.label}, ${average} of 5` : 'No mood recorded'}>
      <div className="mood-emoji">{m ? m.emoji : '—'}</div>
      <div className="ring-value">{average === null ? '—' : `${average} / 5`}</div>
      <div className="ring-label">{m ? `average · ${m.label}` : 'no mood recorded'}</div>
      <div className="ring-caption">
        Recorded on {recorded} of {days} days
      </div>
    </div>
  );
}

/** One bar per mood level, emoji-labelled, with counts printed. */
export function MoodBars({ counts }: { counts: { value: number; count: number }[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (total === 0) return <div className="empty">No mood recorded in this period.</div>;
  return (
    <div className="hbars" role="list" aria-label="Number of days with each mood">
      {[...counts].reverse().map((c) => {
        const m = MOOD_OPTIONS.find((o) => o.value === c.value)!;
        return (
          <div key={c.value} className="hbar" role="listitem" aria-label={`${m.label}: ${c.count} days`}>
            <span className="hbar-label">
              <span style={{ fontSize: 18 }}>{m.emoji}</span> {m.label}
            </span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${(c.count / max) * 100}%`, background: MOOD_COLOR[c.value] }} />
            </span>
            <span className="hbar-value">
              {c.count} <span className="muted">({Math.round((c.count / total) * 100)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal percentage bars (e.g. completion per habit), each linking somewhere. */
export function PercentBars({
  items,
  color,
  search,
}: {
  items: { id: string; name: string; percent: number | null; detail: string; to: string }[];
  color: string;
  search: string;
}) {
  if (items.length === 0) return <div className="empty">Nothing scheduled in this period.</div>;
  return (
    <div className="hbars" role="list">
      {items.map((i) => (
        <Link
          key={i.id}
          to={{ pathname: i.to, search }}
          className="hbar"
          role="listitem"
          aria-label={`${i.name}: ${i.percent === null ? 'no data' : `${Math.round(i.percent)}%`}, ${i.detail}`}
        >
          <span className="hbar-label" title={i.name}>
            {i.name}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${i.percent ?? 0}%`, background: color }} />
          </span>
          <span className="hbar-value">
            {i.percent === null ? '—' : `${Math.round(i.percent)}%`} <span className="muted">{i.detail}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ day calendar

export interface CalendarDay {
  date: string;
  color: string;
  /** Shown inside large squares (e.g. the day number or an emoji). */
  content?: ReactNode;
  /** Light background: use dark text. */
  light?: boolean;
  empty?: boolean;
  description: string;
}

/**
 * One square per day in Monday-first columns of weeks; each day links to its full
 * record. Small ranges get large squares; long ranges scroll sideways inside the card.
 */
export function DayCalendar({
  days,
  search,
  legend,
  hint = 'Hover or tap a day to see it; click to open the full record.',
}: {
  days: CalendarDay[];
  search: string;
  legend: { label: string; color: string }[];
  hint?: string;
}) {
  const [hover, setHover] = useState<CalendarDay | null>(null);
  if (days.length === 0) return null;
  const lead = weekdayOf(days[0]!.date) - 1;
  const weeks = Math.ceil((lead + days.length) / 7);
  const big = weeks <= 6;
  const cell = big ? 30 : 14;

  const monthLabels: { col: number; text: string }[] = [];
  if (!big) {
    let last = '';
    days.forEach((d, i) => {
      const m = d.date.slice(0, 7);
      if (m !== last) {
        last = m;
        monthLabels.push({ col: Math.floor((lead + i) / 7), text: formatShortDate(d.date).split(' ')[1]! });
      }
    });
  }

  return (
    <div>
      <Legend items={legend} />
      <div className="cal-scroll">
        {!big && (
          <div className="cal-months" style={{ gridTemplateColumns: `repeat(${weeks}, ${cell}px)` }}>
            {monthLabels.map((m) => (
              <span key={`${m.col}${m.text}`} style={{ gridColumn: m.col + 1 }}>
                {m.text}
              </span>
            ))}
          </div>
        )}
        <div className="cal-body">
          <div className="cal-weekdays" style={{ gridTemplateRows: `repeat(7, ${cell}px)` }}>
            {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
              <span key={i}>{big ? weekdayName(i + 1) : d}</span>
            ))}
          </div>
          <div
            className="cal-grid"
            style={{ gridTemplateRows: `repeat(7, ${cell}px)`, gridAutoColumns: `${cell}px` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: lead }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {days.map((d) => (
              <Link
                key={d.date}
                to={{ pathname: `/day/${d.date}`, search }}
                className={`cal-cell${d.empty ? ' none' : ''}${d.light ? ' light' : ''}`}
                style={{ background: d.color, fontSize: big ? 12 : 0 }}
                aria-label={d.description}
                onMouseEnter={() => setHover(d)}
                onFocus={() => setHover(d)}
              >
                {big ? (d.content ?? Number(d.date.slice(8))) : ''}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <p className="small muted hover-line" aria-live="polite">
        {hover ? hover.description : hint}
      </p>
    </div>
  );
}

const dayName = (date: string) => `${weekdayName(weekdayOf(date))} ${formatShortDate(date)}`;

export interface DayOutcome {
  date: string;
  count: number;
  diverted: number;
  notDiverted: number;
  unanswered: number;
}

type DayState = 'none' | 'diverted' | 'slip' | 'unanswered';
const DAY_STATE: Record<DayState, { label: string; color: string }> = {
  diverted: { label: 'All diverted', color: COLORS.diverted },
  slip: { label: 'Some not diverted', color: COLORS.notDiverted },
  unanswered: { label: 'Not answered', color: COLORS.unanswered },
  none: { label: 'No urges', color: 'var(--card-alt)' },
};

export function OutcomeCalendar({ days, search }: { days: DayOutcome[]; search: string }) {
  const state = (d: DayOutcome): DayState =>
    d.count === 0 ? 'none' : d.notDiverted > 0 ? 'slip' : d.diverted > 0 ? 'diverted' : 'unanswered';
  const counts = { none: 0, diverted: 0, slip: 0, unanswered: 0 } as Record<DayState, number>;
  for (const d of days) counts[state(d)]++;
  return (
    <DayCalendar
      search={search}
      legend={(['diverted', 'slip', 'unanswered', 'none'] as DayState[]).map((s) => ({
        label: `${DAY_STATE[s].label} (${counts[s]})`,
        color: DAY_STATE[s].color,
      }))}
      days={days.map((d) => {
        const s = state(d);
        const parts = [`${d.count} urge${d.count === 1 ? '' : 's'}`];
        if (d.diverted) parts.push(`${d.diverted} diverted`);
        if (d.notDiverted) parts.push(`${d.notDiverted} not diverted`);
        if (d.unanswered) parts.push(`${d.unanswered} not answered`);
        return {
          date: d.date,
          color: DAY_STATE[s].color,
          empty: s === 'none',
          light: s === 'unanswered',
          description: `${dayName(d.date)}: ${d.count ? parts.join(', ') : 'no urges'}`,
        };
      })}
    />
  );
}

export function HabitCalendar({
  days,
  search,
}: {
  days: { date: string; habitPercent: number | null }[];
  search: string;
}) {
  const band = (p: number | null) => (p === null ? 'none' : p >= 100 ? 'all' : p > 0 ? 'some' : 'zero');
  const color = (p: number | null) =>
    p === null ? 'var(--card-alt)' : p >= 100 ? COLORS.success : p > 0 ? `rgba(${GOOD}, ${(0.25 + (p / 100) * 0.5).toFixed(2)})` : `rgba(${GOOD}, 0.1)`;
  const counts = { all: 0, some: 0, zero: 0, none: 0 };
  for (const d of days) counts[band(d.habitPercent)]++;
  return (
    <DayCalendar
      search={search}
      legend={[
        { label: `All done (${counts.all})`, color: COLORS.success },
        { label: `Partly done (${counts.some})`, color: `rgba(${GOOD}, 0.5)` },
        { label: `Not done (${counts.zero})`, color: `rgba(${GOOD}, 0.1)` },
        { label: `Nothing scheduled (${counts.none})`, color: 'var(--card-alt)' },
      ]}
      days={days.map((d) => ({
        date: d.date,
        color: color(d.habitPercent),
        empty: d.habitPercent === null,
        light: d.habitPercent !== null && d.habitPercent < 60,
        description: `${dayName(d.date)}: ${d.habitPercent === null ? 'no habits scheduled' : `${Math.round(d.habitPercent)}% of habits done`}`,
      }))}
    />
  );
}

export function MoodCalendar({ days, search }: { days: { date: string; mood: number | null }[]; search: string }) {
  return (
    <DayCalendar
      search={search}
      legend={[
        ...[...MOOD_OPTIONS].reverse().map((m) => ({ label: `${m.emoji} ${m.label}`, color: MOOD_COLOR[m.value]! })),
        { label: 'Not recorded', color: 'var(--card-alt)' },
      ]}
      days={days.map((d) => {
        const m = MOOD_OPTIONS.find((o) => o.value === d.mood);
        return {
          date: d.date,
          color: m ? MOOD_COLOR[m.value]! : 'var(--card-alt)',
          content: m ? m.emoji : undefined,
          empty: !m,
          light: !!m,
          description: `${dayName(d.date)}: ${m ? `${m.emoji} ${m.label}` : 'mood not recorded'}`,
        };
      })}
    />
  );
}

// ------------------------------------------------------------------ time-of-day heatmap

type Cell = { weekday: number; block: number } & OutcomeCounts;
type HeatMode = 'all' | 'diverted' | 'notDiverted';

const HEAT_MODES: { key: HeatMode; label: string; rgb: string }[] = [
  { key: 'all', label: 'All urges', rgb: '63, 111, 216' },
  { key: 'diverted', label: 'Diverted', rgb: '63, 111, 216' },
  { key: 'notDiverted', label: 'Not diverted', rgb: '200, 112, 42' },
];

function cellValue(c: Cell, mode: HeatMode) {
  return mode === 'all' ? c.total : mode === 'diverted' ? c.diverted : c.notDiverted;
}

function describeCell(c: Cell) {
  const when = `${weekdayName(c.weekday, 'long')}, ${TIME_BLOCKS[c.block]}`;
  if (c.total === 0) return `${when}: no urges`;
  const parts = [`${c.total} urge${c.total === 1 ? '' : 's'}`, `${c.diverted} diverted`, `${c.notDiverted} not diverted`];
  if (c.unanswered) parts.push(`${c.unanswered} not answered`);
  return `${when}: ${parts.join(', ')}`;
}

/**
 * Weekday × 3-hour block. Switch between all urges, diverted and not diverted. Shade =
 * count (one hue, light to dark); the number is printed so it reads without colour.
 */
export function TimeHeatmap({ cells }: { cells: Cell[] }) {
  const [hover, setHover] = useState<Cell | null>(null);
  const [mode, setMode] = useState<HeatMode>('all');
  const m = HEAT_MODES.find((x) => x.key === mode)!;
  const max = Math.max(1, ...cells.map((c) => cellValue(c, mode)));
  const at = (wd: number, b: number) => cells.find((c) => c.weekday === wd && c.block === b)!;
  const blockTotals = TIME_BLOCKS.map((_, b) =>
    cells.filter((c) => c.block === b).reduce((s, c) => s + cellValue(c, mode), 0),
  );

  return (
    <div>
      <div className="segmented" role="radiogroup" aria-label="Which urges to show">
        {HEAT_MODES.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={mode === x.key}
            className={mode === x.key ? 'on' : ''}
            onClick={() => setMode(x.key)}
          >
            <i style={{ background: `rgb(${x.rgb})` }} aria-hidden="true" />
            {x.label}
          </button>
        ))}
      </div>
      <div className="heat-scroll">
        <table className="heat" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th />
              {TIME_BLOCKS.map((t) => (
                <th key={t} scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
              <tr key={wd}>
                <th scope="row">{weekdayName(wd)}</th>
                {TIME_BLOCKS.map((_, b) => {
                  const c = at(wd, b);
                  const v = cellValue(c, mode);
                  const a = v ? 0.14 + 0.86 * (v / max) : 0;
                  return (
                    <td
                      key={b}
                      tabIndex={0}
                      aria-label={describeCell(c)}
                      onMouseEnter={() => setHover(c)}
                      onFocus={() => setHover(c)}
                      style={{
                        background: v ? `rgba(${m.rgb}, ${a.toFixed(2)})` : 'var(--card-alt)',
                        color: a > 0.55 ? '#fff' : 'var(--text)',
                      }}
                    >
                      {v || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="heat-total">
              <th scope="row">All</th>
              {blockTotals.map((n, b) => (
                <td key={b}>{n || '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted hover-line" aria-live="polite">
        {hover ? describeCell(hover) : `Showing ${m.label.toLowerCase()}. Darker = more. Hover a cell for the full split.`}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ insights

export function Insights({ items, more }: { items: string[]; more?: { to: string; search: string; label: string } }) {
  return (
    <div className="insights">
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {more && (
        <Link to={{ pathname: more.to, search: more.search }} className="small">
          {more.label} →
        </Link>
      )}
    </div>
  );
}
