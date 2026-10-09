import { useEffect, useState } from 'react';
import { MEASUREMENT_LABELS, MEASUREMENT_TYPES, weekdayName, type HabitRecord, type MeasurementType } from '@journal/shared';
import { errorMessage } from '../api';
import { Card, ErrorBox } from '../components/ui';
import { newId, remove, save, useOwnerData } from './store';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

interface Draft {
  id?: string;
  name: string;
  description: string;
  measurementType: MeasurementType;
  targetValue: string;
  unit: string;
  scheduleDays: number[];
  isActive: boolean;
  archivedAt: string | null;
  displayOrder: number;
}

function HabitDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await save('habits', {
        id: d.id ?? newId(),
        name: d.name,
        description: d.description || null,
        measurementType: d.measurementType,
        targetValue: d.measurementType === 'boolean' ? 1 : Number(d.targetValue),
        unit: d.measurementType === 'quantity' || d.measurementType === 'count' ? d.unit || null : null,
        scheduleDays: d.scheduleDays,
        isActive: d.isActive,
        archivedAt: d.archivedAt,
        displayOrder: d.displayOrder,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={d.id ? 'Edit habit' : 'New habit'} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{d.id ? 'Edit habit' : 'New habit'}</h2>
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="field">
            Name
            <input type="text" autoFocus maxLength={100} value={d.name} placeholder="e.g. Read" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            Description (optional)
            <input type="text" maxLength={500} value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="field">
            How is it measured?
            <select value={d.measurementType} onChange={(e) => set({ measurementType: e.target.value as MeasurementType })}>
              {MEASUREMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEASUREMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {d.measurementType !== 'boolean' && (
            <div className="row">
              <label className="field" style={{ flex: '1 1 120px' }}>
                Daily target
                <input type="number" min={0} step="any" value={d.targetValue} onChange={(e) => set({ targetValue: e.target.value })} />
              </label>
              {d.measurementType === 'duration' ? (
                <span className="muted" style={{ paddingTop: 20 }}>
                  minutes
                </span>
              ) : (
                <label className="field" style={{ flex: '1 1 120px' }}>
                  Unit{d.measurementType === 'quantity' ? '' : ' (optional)'}
                  <input type="text" maxLength={32} value={d.unit} placeholder={d.measurementType === 'quantity' ? 'e.g. litres' : 'e.g. pages'} onChange={(e) => set({ unit: e.target.value })} />
                </label>
              )}
            </div>
          )}
          <div className="field">
            Days
            <div className="chips">
              {ALL_DAYS.map((w) => {
                const on = d.scheduleDays.includes(w);
                return (
                  <button key={w} type="button" aria-pressed={on} className={`chip${on ? ' on' : ''}`} onClick={() => set({ scheduleDays: on ? d.scheduleDays.filter((x) => x !== w) : [...d.scheduleDays, w] })}>
                    {weekdayName(w)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" className="big-check" checked={d.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
            Active (shown on scheduled days)
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !d.name.trim() || d.scheduleDays.length === 0}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The owner adds, edits, pauses, archives and deletes habits from the website. */
export function HabitsEditor({ onChanged }: { onChanged: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error, reload } = useOwnerData(today, today);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const habits = [...data.records.habits].sort((a, b) => a.displayOrder - b.displayOrder);

  const edit = (h?: HabitRecord) =>
    setDraft(
      h
        ? { id: h.id, name: h.name, description: h.description ?? '', measurementType: h.measurementType, targetValue: String(h.targetValue), unit: h.unit ?? '', scheduleDays: h.scheduleDays, isActive: h.isActive, archivedAt: h.archivedAt, displayOrder: h.displayOrder }
        : { name: '', description: '', measurementType: 'boolean', targetValue: '1', unit: '', scheduleDays: ALL_DAYS, isActive: true, archivedAt: null, displayOrder: habits.length },
    );

  const run = async (fn: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };

  return (
    <Card title="Manage habits" right={<button type="button" className="btn primary" onClick={() => edit()}>+ New habit</button>}>
      <ul className="task-list">
        {habits.map((h) => (
          <li key={h.id}>
            <div style={{ flex: 1, opacity: h.isActive && !h.archivedAt ? 1 : 0.6 }}>
              <strong>{h.name}</strong> {h.archivedAt ? <span className="badge">Archived</span> : !h.isActive && <span className="badge">Paused</span>}
              <div className="small muted">
                {MEASUREMENT_LABELS[h.measurementType]}
                {h.measurementType !== 'boolean' && ` · ${h.targetValue} ${h.unit ?? ''}`} · {h.scheduleDays.length === 7 ? 'Every day' : h.scheduleDays.map((w) => weekdayName(w)).join(', ')}
              </div>
            </div>
            <button type="button" className="btn" onClick={() => edit(h)}>
              Edit
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void run(() => save('habits', { ...h, archivedAt: h.archivedAt ? null : new Date().toISOString() }))}
            >
              {h.archivedAt ? 'Restore' : 'Archive'}
            </button>
            <button
              type="button"
              className="btn link"
              aria-label={`Delete ${h.name}`}
              onClick={() => window.confirm(`Delete "${h.name}"? Its history stays in past days.`) && void run(() => remove('habits', h))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {problem && <ErrorBox message={problem} />}
      {draft && (
        <HabitDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void reload();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
