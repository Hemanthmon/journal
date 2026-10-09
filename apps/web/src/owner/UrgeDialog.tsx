import { useEffect, useState } from 'react';
import { formatEmotions, parseEmotions, type UrgeRecord } from '@journal/shared';
import { errorMessage } from '../api';
import { newId, remove, save } from './store';

type YesNo = 'yes' | 'no' | 'unset';
const toYesNo = (v: boolean | null | undefined): YesNo => (v === true ? 'yes' : v === false ? 'no' : 'unset');
const fromYesNo = (v: YesNo) => (v === 'yes' ? true : v === 'no' ? false : null);

function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (v: YesNo) => void }) {
  return (
    <div className="field">
      {label}
      <div className="chips" role="radiogroup" aria-label={label}>
        {(['no', 'yes', 'unset'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={`chip${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>
            {v === 'no' ? 'No' : v === 'yes' ? 'Yes' : 'Skip'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Record or edit an urge, with the same fields as the app. */
export function UrgeDialog({
  date,
  urge,
  emotions,
  onClose,
  onSaved,
}: {
  date: string;
  urge: UrgeRecord | null;
  emotions: string[];
  onClose: () => void;
  onSaved: (u: UrgeRecord, deleted: boolean) => void;
}) {
  const now = new Date();
  const parsed = parseEmotions(urge?.emotionBefore, emotions);
  const [localDate, setLocalDate] = useState(urge?.localDate ?? date);
  const [localTime, setLocalTime] = useState(urge?.localTime.slice(0, 5) ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const [intensity, setIntensity] = useState<number | null>(urge?.intensity ?? null);
  const [duration, setDuration] = useState(urge?.durationMinutes?.toString() ?? '');
  const [trigger, setTrigger] = useState(urge?.triggerText ?? '');
  const [selected, setSelected] = useState<string[]>(parsed.selected);
  const [other, setOther] = useState(parsed.other);
  const [action, setAction] = useState(urge?.actionTaken ?? '');
  const [outcome, setOutcome] = useState(urge?.outcome ?? '');
  const [masturbated, setMasturbated] = useState<YesNo>(toYesNo(urge?.masturbated));
  const [explicit, setExplicit] = useState<YesNo>(toYesNo(urge?.explicitContent));
  const [remarks, setRemarks] = useState(urge?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (intensity === null) return setError('Choose an intensity from 0 to 10.');
    setBusy(true);
    setError(null);
    const mins = duration.trim() === '' ? null : Math.round(Number(duration));
    try {
      const saved = await save<UrgeRecord>('urges', {
        id: urge?.id ?? newId(),
        occurredAt: urge?.occurredAt ?? new Date(`${localDate}T${localTime}:00`).toISOString(),
        localDate,
        localTime,
        intensity,
        durationMinutes: mins !== null && Number.isFinite(mins) ? mins : null,
        triggerText: trigger || null,
        emotionBefore: formatEmotions(selected, other, emotions),
        actionTaken: action || null,
        outcome: outcome || null,
        masturbated: fromYesNo(masturbated),
        explicitContent: fromYesNo(explicit),
        remarks: remarks || null,
      });
      onSaved(saved, false);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const del = async () => {
    if (!urge || !window.confirm('Delete this record? It is removed from all your devices.')) return;
    setBusy(true);
    try {
      await remove('urges', urge as unknown as { id: string } & Record<string, unknown>);
      onSaved(urge, true);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={urge ? 'Edit urge' : 'Log an urge'} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{urge ? 'Edit urge' : 'Log an urge'}</h2>
        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            Intensity (0–10)
            <div className="chips" role="radiogroup" aria-label="Intensity">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} type="button" role="radio" aria-checked={intensity === i} className={`chip${intensity === i ? ' on' : ''}`} onClick={() => setIntensity(i)}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <label className="field" style={{ flex: '1 1 150px' }}>
              Date
              <input type="date" value={localDate} onChange={(e) => e.target.value && setLocalDate(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 110px' }}>
              Time
              <input type="time" value={localTime} onChange={(e) => e.target.value && setLocalTime(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 110px' }}>
              Lasted (min)
              <input type="number" min={0} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Trigger
            <input type="text" value={trigger} maxLength={1000} placeholder="What set it off?" onChange={(e) => setTrigger(e.target.value)} />
          </label>
          <div className="field">
            Emotion felt before
            <div className="chips">
              {emotions.map((e) => {
                const on = selected.includes(e);
                return (
                  <button key={e} type="button" aria-pressed={on} className={`chip${on ? ' on' : ''}`} onClick={() => setSelected((cur) => (on ? cur.filter((x) => x !== e) : [...cur, e]))}>
                    {e}
                  </button>
                );
              })}
            </div>
            <input type="text" value={other} maxLength={200} placeholder="Other (optional)" onChange={(e) => setOther(e.target.value)} />
          </div>
          <label className="field">
            What did I do?
            <textarea rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
          </label>
          <label className="field">
            What happened after?
            <textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </label>
          <div className="row">
            <YesNoField label="Watched explicit content?" value={explicit} onChange={setExplicit} />
            <YesNoField label="Masturbated?" value={masturbated} onChange={setMasturbated} />
          </div>
          <label className="field">
            Remarks
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              {urge && (
                <button type="button" className="btn danger" disabled={busy} onClick={() => void del()}>
                  Delete
                </button>
              )}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
