import { addDays, weekdayName, weekdayOf, type CalendarSeries } from '@journal/shared';

export interface RepeatChoice {
  frequency: 'daily' | 'weekly' | 'custom';
  days: number[];
  endDate: string | null;
}

export const choiceOf = (s: CalendarSeries | undefined | null): RepeatChoice | null =>
  s ? { frequency: s.frequency, days: s.days, endDate: s.endDate } : null;

/** Doesn't repeat / Daily / Weekly / Custom days, with an optional last day. */
export function RepeatField({ date, value, onChange }: { date: string; value: RepeatChoice | null; onChange: (v: RepeatChoice | null) => void }) {
  const wd = weekdayOf(date);
  const mode = value?.frequency ?? 'none';
  const pick = (m: string) => {
    if (m === 'none') return onChange(null);
    const days = m === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : m === 'weekly' ? [wd] : value?.frequency === 'custom' ? value.days : [wd];
    onChange({ frequency: m as RepeatChoice['frequency'], days, endDate: value?.endDate ?? null });
  };
  return (
    <div className="field">
      Repeat
      <select value={mode} onChange={(e) => pick(e.target.value)}>
        <option value="none">Doesn't repeat</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week on {weekdayName(wd, 'long')}</option>
        <option value="custom">Custom days…</option>
      </select>
      {value?.frequency === 'custom' && (
        <div className="chips" aria-label="Repeat on">
          {[1, 2, 3, 4, 5, 6, 7].map((w) => {
            const on = value.days.includes(w);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                className={`chip${on ? ' on' : ''}`}
                onClick={() => {
                  const days = on ? value.days.filter((x) => x !== w) : [...value.days, w].sort();
                  if (days.length) onChange({ ...value, days });
                }}
              >
                {weekdayName(w)}
              </button>
            );
          })}
        </div>
      )}
      {value && (
        <div className="row">
          <label className="row small" style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={!!value.endDate} onChange={(e) => onChange({ ...value, endDate: e.target.checked ? addDays(date, 27) : null })} />
            Ends on
          </label>
          {value.endDate && (
            <input type="date" min={date} value={value.endDate} onChange={(e) => e.target.value && onChange({ ...value, endDate: e.target.value < date ? date : e.target.value })} />
          )}
        </div>
      )}
    </div>
  );
}

/** "This one / This and following" for a repeating item; shown inline in a dialog. */
export function ScopeAsk({ what, verb, onPick, onCancel }: { what: string; verb: string; onPick: (s: 'one' | 'following') => void; onCancel: () => void }) {
  return (
    <div className="notice" role="alertdialog" aria-label={`${verb} a repeating ${what}`}>
      <strong>
        {verb} a repeating {what}:
      </strong>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary" autoFocus onClick={() => onPick('one')}>
          This {what} only
        </button>
        <button type="button" className="btn" onClick={() => onPick('following')}>
          This and following
        </button>
        <button type="button" className="btn link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
