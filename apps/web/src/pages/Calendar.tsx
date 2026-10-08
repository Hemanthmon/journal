import { useEffect, useState } from 'react';
import {
  BLOCK_COLORS,
  addDays,
  formatShortDate,
  formatTime12,
  weekStartOf,
  weekdayName,
  weekdayOf,
  type BlockColor,
  type BlockInput,
  type CalendarBlock,
  type DashboardCalendar,
} from '@journal/shared';
import { api, errorMessage, useApi } from '../api';
import { ErrorBox, Loading } from '../components/ui';

const HOUR = 48; // px per hour
const FIRST_HOUR = 5;
const LAST_HOUR = 24;

const COLOR_NAMES: Record<BlockColor, string> = { sage: 'Sage', sky: 'Sky', lavender: 'Lavender', peach: 'Peach', rose: 'Rose', sand: 'Sand' };

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hourLabel = (h: number) => (h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

type Item = { kind: 'block'; b: CalendarBlock; start: number; end: number } | { kind: 'task'; t: DashboardCalendar['tasks'][number]; start: number; end: number };

/** Overlapping items share the column width, like Google Calendar. */
function layout(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { item: Item; col: number; cols: number }[] = [];
  let group: { item: Item; col: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    group.forEach((g) => out.push({ ...g, cols }));
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.item.end > item.start).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ item, col });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return out;
}

interface Draft extends BlockInput {
  id?: string;
}

function BlockDialog({ draft, identities, onClose, onSaved }: { draft: Draft; identities: DashboardCalendar['identities']; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const endOk = d.endTime > d.startTime;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const { id, ...body } = d;
    try {
      if (id) await api.put(`/blocks/${id}`, body);
      else await api.post('/blocks', body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.id || !window.confirm(`Delete "${d.title}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/blocks/${d.id}`);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={d.id ? 'Edit block' : 'New block'} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{d.id ? 'Edit block' : 'New block'}</h2>
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (d.title.trim() && endOk) void save();
          }}
        >
          <label className="field">
            Title
            <input autoFocus value={d.title} maxLength={200} placeholder="e.g. Deep work" onChange={(e) => set({ title: e.target.value })} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: '1 1 140px' }}>
              Day
              <input type="date" value={d.localDate} onChange={(e) => e.target.value && set({ localDate: e.target.value })} />
            </label>
            <label className="field" style={{ flex: '1 1 100px' }}>
              Starts
              <input
                type="time"
                step={300}
                value={d.startTime}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const len = Math.max(15, mins(d.endTime) - mins(d.startTime));
                  set({ startTime: e.target.value, endTime: hhmm(Math.min(mins(e.target.value) + len, 23 * 60 + 59)) });
                }}
              />
            </label>
            <label className="field" style={{ flex: '1 1 100px' }}>
              Ends
              <input type="time" step={300} value={d.endTime} onChange={(e) => e.target.value && set({ endTime: e.target.value })} />
            </label>
          </div>
          {!endOk && <div className="error">The block must end after it starts.</div>}
          <div>
            <div className="small muted" style={{ marginBottom: 6 }}>Colour</div>
            <div className="chips" role="radiogroup" aria-label="Colour">
              {BLOCK_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={d.color === c} className={`chip swatch ${c}${d.color === c ? ' on' : ''}`} onClick={() => set({ color: c })}>
                  {COLOR_NAMES[c]}
                </button>
              ))}
            </div>
          </div>
          {identities.length > 0 && (
            <label className="field">
              Who is this time for?
              <select value={d.identityId ?? ''} onChange={(e) => set({ identityId: e.target.value || null })}>
                <option value="">—</option>
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.statement}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Notes
            <textarea rows={3} maxLength={2000} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              {d.id && (
                <button type="button" className="btn danger" disabled={busy} onClick={() => void remove()}>
                  Delete
                </button>
              )}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy || !d.title.trim() || !endOk}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function Calendar() {
  const narrow = useNarrow();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const weekFrom = anchor ? weekStartOf(anchor) : null;
  const url = weekFrom ? `/calendar?from=${weekFrom}&to=${addDays(weekFrom, 6)}` : '/calendar';
  const { data, error, loading, reload } = useApi<DashboardCalendar>(url);
  const [day, setDay] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const allDays = Array.from({ length: 7 }, (_, i) => addDays(data.from, i));
  const focusDay = day && allDays.includes(day) ? day : allDays.includes(data.today) ? data.today : data.from;
  const days = narrow ? [focusDay] : allDays;
  const isThisWeek = allDays.includes(data.today);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const newBlock = (date: string, start: number) =>
    data.canEdit &&
    setDraft({ title: '', localDate: date, startTime: hhmm(start), endTime: hhmm(Math.min(start + 60, 23 * 60 + 59)), color: 'sage', identityId: null, notes: null });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Calendar</h1>
        <div className="row">
          <button className="btn" type="button" aria-label="Previous week" onClick={() => setAnchor(addDays(data.from, -7))}>
            ←
          </button>
          <strong>
            {formatShortDate(data.from)} – {formatShortDate(data.to)}
          </strong>
          <button className="btn" type="button" aria-label="Next week" onClick={() => setAnchor(addDays(data.from, 7))}>
            →
          </button>
          {!isThisWeek && (
            <button className="btn" type="button" onClick={() => setAnchor(null)}>
              This week
            </button>
          )}
          {data.canEdit && (
            <button className="btn primary" type="button" onClick={() => newBlock(focusDay, 9 * 60)}>
              + Block
            </button>
          )}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {data.canEdit ? 'Click an empty time to add a block, or a block to edit it. Changes reach the app on its next sync.' : 'Time blocks and timed tasks. Read-only.'}
        {data.google.connected && ' Synced with Google Calendar.'}
        {loading && ' Updating…'}
      </p>

      {narrow && (
        <div className="chips" role="tablist" aria-label="Day">
          {allDays.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === focusDay} className={`chip${d === focusDay ? ' on' : ''}`} onClick={() => setDay(d)}>
              {weekdayName(weekdayOf(d))} {Number(d.slice(8))}
            </button>
          ))}
        </div>
      )}

      <div className="card cal" style={{ padding: 0 }}>
        <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`cal-day-head${d === data.today ? ' today' : ''}`}>
              <span className="small muted">{weekdayName(weekdayOf(d))}</span>
              <strong>{Number(d.slice(8))}</strong>
            </div>
          ))}
        </div>
        <div className="cal-body" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div className="cal-gutter" style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR }}>
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
              <div key={i} className="cal-hour-label" style={{ top: i * HOUR }}>
                {i === 0 ? '' : hourLabel(FIRST_HOUR + i)}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const items: Item[] = [
              ...data.blocks.filter((b) => b.date === d).map((b) => ({ kind: 'block' as const, b, start: mins(b.start), end: mins(b.end) })),
              ...data.tasks.filter((t) => t.date === d).map((t) => ({ kind: 'task' as const, t, start: mins(t.time), end: Math.min(mins(t.time) + 30, 24 * 60) })),
            ];
            return (
              <div key={d} className={`cal-col${data.canEdit ? ' editable' : ''}`} style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR }}>
                {Array.from({ length: (LAST_HOUR - FIRST_HOUR) * 2 }, (_, i) => {
                  const start = FIRST_HOUR * 60 + i * 30;
                  return (
                    <div
                      key={i}
                      className={`cal-slot${i % 2 === 0 ? ' hour' : ''}`}
                      style={{ top: i * (HOUR / 2), height: HOUR / 2 }}
                      onClick={() => newBlock(d, start)}
                      title={data.canEdit ? `Add a block at ${formatTime12(hhmm(start))}` : undefined}
                    />
                  );
                })}
                {layout(items).map(({ item, col, cols }) => {
                  const top = ((Math.max(item.start, FIRST_HOUR * 60) - FIRST_HOUR * 60) / 60) * HOUR;
                  const height = Math.max(20, ((item.end - Math.max(item.start, FIRST_HOUR * 60)) / 60) * HOUR - 2);
                  const style = { top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
                  if (item.kind === 'block') {
                    const b = item.b;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`cal-block ${b.color}`}
                        style={style}
                        disabled={!data.canEdit}
                        title={[b.title, `${formatTime12(b.start)} – ${formatTime12(b.end)}`, b.identity, b.notes].filter(Boolean).join('\n')}
                        onClick={() =>
                          data.canEdit &&
                          setDraft({ id: b.id, title: b.title, localDate: b.date, startTime: b.start, endTime: b.end, color: b.color, identityId: b.identityId, notes: b.notes })
                        }
                      >
                        <strong>{b.title}</strong>
                        {height > 34 && (
                          <span>
                            {formatTime12(b.start)} – {formatTime12(b.end)}
                          </span>
                        )}
                      </button>
                    );
                  }
                  const t = item.t;
                  return (
                    <div key={t.id} className={`cal-task${t.done ? ' done' : ''}`} style={style} title={`${t.title} · ${formatTime12(t.time)}${t.identity ? ` · ${t.identity}` : ''}`}>
                      {t.done ? '✅' : '⬜'} {t.title}
                    </div>
                  );
                })}
                {d === data.today && nowMin >= FIRST_HOUR * 60 && <div className="cal-now" style={{ top: ((nowMin - FIRST_HOUR * 60) / 60) * HOUR }} />}
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <BlockDialog
          draft={draft}
          identities={data.identities}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
