import type { ReactNode } from 'react';
import { MOOD_OPTIONS, formatTime12 } from '@journal/shared';

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Progress({ percent, label }: { percent: number | null; label?: string }) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div
      className={`progress${p >= 100 ? ' done' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p)}
    >
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
export const num = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(digits);
export const time12 = (t: string | null | undefined) => (t ? formatTime12(t) : '');

export function Mood({ value, withLabel }: { value: number | null; withLabel?: boolean }) {
  const m = MOOD_OPTIONS.find((o) => o.value === value);
  if (!m) return <span className="muted">—</span>;
  return (
    <span title={m.label} aria-label={m.label}>
      {m.emoji}
      {withLabel ? ` ${m.label}` : ''}
    </span>
  );
}

export const yesNo = (v: boolean | null) => (v === null ? '—' : v ? 'Yes' : 'No');

const OUTCOME_COLOR = { true: '#3f6fd8', false: '#c8702a' } as const;

/** Diverted / Not diverted, with a colour dot; the text carries the meaning. */
export function Outcome({ diverted }: { diverted: boolean | null }) {
  if (diverted === null) return <span className="muted">Not answered</span>;
  return (
    <span className="outcome">
      <span
        aria-hidden="true"
        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: OUTCOME_COLOR[`${diverted}`] }}
      />
      {diverted ? 'Diverted' : 'Not diverted'}
    </span>
  );
}
