import type { ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatShortDate } from '@journal/shared';

/** Colours readable in light and dark mode. */
export const COLORS = {
  primary: '#5b7fdb',
  success: '#2f9e76',
  warm: '#d98c3a',
  violet: '#8b6fd6',
  grid: 'rgba(128,140,160,0.25)',
  tick: '#8a93a3',
  // Diverted vs not diverted: a blue/orange pair, validated for colour-blind separation
  // and contrast on both the light and dark card surfaces.
  diverted: '#3f6fd8',
  notDiverted: '#c8702a',
  unanswered: '#9aa3b2',
};

/** Series shown in urge-outcome charts, in a fixed order. */
export const OUTCOME_SERIES = [
  { key: 'diverted', label: 'Diverted', color: COLORS.diverted },
  { key: 'notDiverted', label: 'Not diverted', color: COLORS.notDiverted },
  { key: 'unanswered', label: 'Not answered', color: COLORS.unanswered },
] as const;

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Line graph over dates: one dot per day joined by a line, so every day (including 0s)
 * is visible. Legend above for 2+ series; hover shows every series for that day.
 */
export function DayLines({
  data,
  series,
  label,
  xKey = 'date',
  xFormat = shortDate,
  labelFormat,
  valueFormat = (v) => String(v),
  yDomain,
  yUnit,
  allowDecimals = false,
  height = 240,
}: {
  data: object[];
  series: readonly LineSeries[];
  label: string;
  xKey?: string;
  xFormat?: (v: string) => string;
  labelFormat?: (v: string, payload: Record<string, unknown> | undefined) => ReactNode;
  valueFormat?: (v: number, key: string, payload: Record<string, unknown>) => string;
  yDomain?: [number, number | 'auto'];
  yUnit?: string;
  allowDecimals?: boolean;
  height?: number;
}) {
  const dense = data.length > 45;
  return (
    <>
      {series.length > 1 && <Legend items={series} />}
      <ChartBox label={label} height={height}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={tick} minTickGap={20} />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            allowDecimals={allowDecimals}
            unit={yUnit}
            tick={tick}
            width={yUnit ? 52 : 36}
          />
          <Tooltip
            {...tooltipStyle}
            cursor={{ stroke: COLORS.tick, strokeDasharray: '3 3' }}
            labelFormatter={(v, p) =>
              labelFormat ? labelFormat(String(v), p[0]?.payload as Record<string, unknown> | undefined) : xFormat(String(v))
            }
            formatter={(v, name, p) => {
              const s = series.find((x) => x.key === name);
              return [valueFormat(Number(v), String(name), p.payload as Record<string, unknown>), s?.label ?? name];
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={dense ? false : { r: 3.5, fill: s.color, stroke: 'var(--card)', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: s.color, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive
            />
          ))}
        </LineChart>
      </ChartBox>
    </>
  );
}

export function Legend({ items }: { items: readonly { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className="swatch" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const tick = { fill: COLORS.tick, fontSize: 12 };
export const shortDate = (d: string) => formatShortDate(d);

export function ChartBox({ height = 240, children, label }: { height?: number; children: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export const tooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
};
