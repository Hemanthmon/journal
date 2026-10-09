import { useEffect, useRef, useState } from 'react';
import {
  BLOCK_COLORS,
  addDays,
  formatLongDate,
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
import { newId, save } from '../owner/store';
import { RepeatField, ScopeAsk, choiceOf, type RepeatChoice } from '../owner/RepeatField';
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
  seriesId?: string | null;
}

function BlockDialog({
  draft,
  identities,
  series,
  onClose,
  onSaved,
}: {
  draft: Draft;
  identities: DashboardCalendar['identities'];
  series: DashboardCalendar['series'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [repeat, setRepeat] = useState<RepeatChoice | null>(() => choiceOf(series.find((s) => s.id === draft.seriesId)));
  const [ask, setAsk] = useState<'save' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const endOk = d.endTime > d.startTime;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setAsk(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const fields = () => ({ title: d.title, startTime: d.startTime, endTime: d.endTime, color: d.color, identityId: d.identityId ?? null, notes: d.notes ?? null });

  const save = (scope?: 'one' | 'following') => {
    const { id, seriesId: _s, ...body } = d;
    if (!id) return void run(() => (repeat ? api.post('/owner/series', { kind: 'block', startDate: d.localDate, fields: fields(), repeat }) : api.post('/blocks', body)));
    if (d.seriesId && !scope) return setAsk('save');
    if (d.seriesId || repeat)
      return void run(() => api.post('/owner/occurrence/edit', { kind: 'block', id, scope: scope ?? 'one', date: d.localDate, fields: fields(), repeat }));
    void run(() => api.put(`/blocks/${id}`, body));
  };

  const remove = (scope?: 'one' | 'following') => {
    if (!d.id) return;
    if (d.seriesId && !scope) return setAsk('delete');
    if (!d.seriesId && !window.confirm(`Delete "${d.title}"?`)) return;
    void run(() => (d.seriesId ? api.post('/owner/occurrence/delete', { kind: 'block', id: d.id, scope }) : api.delete(`/blocks/${d.id}`)));
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
            if (d.title.trim() && endOk) save();
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
          <RepeatField date={d.localDate} value={repeat} onChange={setRepeat} />
          <label className="field">
            Notes
            <textarea rows={3} maxLength={2000} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          {ask && <ScopeAsk what="block" verb={ask === 'save' ? 'Change' : 'Delete'} onCancel={() => setAsk(null)} onPick={(sc) => (ask === 'save' ? save(sc) : remove(sc))} />}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              {d.id && (
                <button type="button" className="btn danger" disabled={busy} onClick={() => remove()}>
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

type ViewMode = 'day' | 'week' | 'month';

const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clampDay = (m: number) => Math.max(0, Math.min(24 * 60 - 1, m));
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => {
  const [y, m] = d.split('-').map(Number) as [number, number];
  return addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, -1);
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What the pointer is doing on the time grid. */
type Drag =
  | { kind: 'create'; day: number; from: number; to: number }
  | { kind: 'move'; block: CalendarBlock; grabOffset: number; day: number; start: number; moved: boolean }
  | { kind: 'resize'; block: CalendarBlock; end: number; moved: boolean };

function rangeFor(view: ViewMode, focus: string) {
  if (view === 'day') return { from: focus, to: focus };
  if (view === 'week') {
    const from = weekStartOf(focus);
    return { from, to: addDays(from, 6) };
  }
  // Month: whole weeks covering the month, like a wall calendar.
  const from = weekStartOf(monthStart(focus));
  const end = monthEnd(focus);
  return { from, to: addDays(weekStartOf(end), 6) };
}

export function Calendar() {
  const narrow = useNarrow();
  const [view, setView] = useState<ViewMode>(() => (window.matchMedia('(max-width: 760px)').matches ? 'day' : 'week'));
  const [focus, setFocus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Clicking empty time first asks: a block, or a task at that time?
  const [choice, setChoice] = useState<{ date: string; from: number; to: number } | null>(null);
  const [taskAt, setTaskAt] = useState<{ date: string; time: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // The server knows the owner's "today"; until the first load, use the browser's.
  const browserToday = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const at = focus ?? browserToday;
  const range = rangeFor(view, at);
  const { data, error, reload, setData } = useCalendar(range.from, range.to);

  // Open the time grid at the current time this period (else the earliest block, else 8 AM).
  const shownKey = `${view}:${range.from}`;
  useEffect(() => {
    if (!data || !body.current || view === 'month') return;
    const inRange = data.today >= data.from && data.today <= data.to;
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const first = data.blocks.length ? Math.min(...data.blocks.map((b) => mins(b.start))) : 8 * 60;
    body.current.scrollTop = Math.max(0, (((inRange ? now : first) - FIRST_HOUR * 60) / 60) * HOUR - HOUR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, !!data]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const today = data.today;
  const days = view === 'day' ? [at] : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(range.from, i)) : [];
  const canEdit = data.canEdit;

  // ---------------------------------------------------------------- pointer → time/day
  const pointAt = (clientX: number, clientY: number) => {
    const el = body.current!;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop;
    const minute = clampDay(FIRST_HOUR * 60 + (y / HOUR) * 60);
    const colWidth = (rect.width - 56) / days.length;
    const day = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left - 56) / colWidth)));
    return { minute, day };
  };

  const persist = async (b: CalendarBlock, patch: Partial<BlockInput>) => {
    const body: BlockInput = { title: b.title, localDate: b.date, startTime: b.start, endTime: b.end, color: b.color, identityId: b.identityId, notes: b.notes, ...patch };
    // Show it at once; the server confirms (or we reload on failure).
    setData((d) => d && { ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, date: body.localDate, start: body.startTime, end: body.endTime } : x)) });
    try {
      await api.put(`/blocks/${b.id}`, body);
    } catch (e) {
      setProblem(errorMessage(e));
      void reload();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pointAt(e.clientX, e.clientY);
    if (d.kind === 'create') setDrag({ ...d, to: snap(p.minute) });
    else if (d.kind === 'move') {
      const len = mins(d.block.end) - mins(d.block.start);
      const start = Math.max(0, Math.min(24 * 60 - len, snap(p.minute - d.grabOffset)));
      if (start !== d.start || p.day !== d.day) setDrag({ ...d, start, day: p.day, moved: true });
    } else {
      const end = Math.max(mins(d.block.start) + SNAP, Math.min(24 * 60 - 1, snap(p.minute)));
      if (end !== d.end) setDrag({ ...d, end, moved: true });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'create') {
      let from = Math.min(d.from, d.to);
      let to = Math.max(d.from, d.to);
      if (to - from < SNAP) to = Math.min(from + 60, 24 * 60 - 1); // a click: one hour
      if (to >= 24 * 60) to = 24 * 60 - 1;
      from = Math.min(from, to - SNAP);
      setChoice({ date: days[d.day]!, from, to });
    } else if (d.kind === 'move') {
      if (!d.moved) {
        const b = d.block;
        setDraft({ id: b.id, title: b.title, localDate: b.date, startTime: b.start, endTime: b.end, color: b.color, identityId: b.identityId, notes: b.notes, seriesId: b.seriesId });
        return;
      }
      const len = mins(d.block.end) - mins(d.block.start);
      void persist(d.block, { localDate: days[d.day]!, startTime: hhmm(d.start), endTime: hhmm(Math.min(d.start + len, 24 * 60 - 1)) });
    } else if (d.moved) {
      void persist(d.block, { endTime: hhmm(d.end) });
    }
  };

  // ---------------------------------------------------------------- header
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
  const go = (dir: -1 | 1) => {
    if (view === 'month') {
      const [y, m] = monthStart(at).split('-').map(Number) as [number, number];
      const t = y * 12 + (m - 1) + dir;
      setFocus(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`);
    } else setFocus(addDays(at, dir * step));
  };
  const title =
    view === 'month'
      ? `${MONTHS[Number(monthStart(at).slice(5, 7)) - 1]} ${at.slice(0, 4)}`
      : view === 'day'
        ? formatLongDate(at)
        : `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
  const showsToday = today >= range.from && today <= range.to;

  const header = (
    <div className="cal-toolbar">
      <div className="row">
        <button className="btn" type="button" onClick={() => setFocus(today)} disabled={showsToday && (view !== 'day' || at === today)}>
          Today
        </button>
        <button className="btn icon" type="button" aria-label="Previous" onClick={() => go(-1)}>
          ‹
        </button>
        <button className="btn icon" type="button" aria-label="Next" onClick={() => go(1)}>
          ›
        </button>
        <h1 className="cal-title">{title}</h1>
      </div>
      <div className="row">
        <div className="seg" role="tablist" aria-label="View">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        {canEdit && (
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              const n = new Date();
              const from = Math.min(snap(n.getHours() * 60 + n.getMinutes()), 23 * 60);
              setChoice({ date: view === 'day' ? at : showsToday ? today : range.from, from, to: Math.min(from + 60, 24 * 60 - 1) });
            }}
          >
            + Create
          </button>
        )}
      </div>
    </div>
  );

  const chooser = choice && (
    <div className="modal-backdrop" onClick={() => setChoice(null)}>
      <div className="card modal chooser" role="dialog" aria-modal="true" aria-label="Add" onClick={(e) => e.stopPropagation()}>
        <div className="muted small">{formatLongDate(choice.date)}</div>
        <h2 style={{ margin: '2px 0 14px' }}>Add at {formatTime12(hhmm(choice.from))}</h2>
        <div className="chooser-options">
          <button
            type="button"
            className="chooser-option"
            autoFocus
            onClick={() => {
              setChoice(null);
              setDraft({ title: '', localDate: choice.date, startTime: hhmm(choice.from), endTime: hhmm(choice.to), color: 'sage', identityId: null, notes: null });
            }}
          >
            <span className="chooser-icon">▦</span>
            <strong>Block</strong>
            <span className="small muted">
              {formatTime12(hhmm(choice.from))} – {formatTime12(hhmm(choice.to))}, like Deep work
            </span>
          </button>
          <button
            type="button"
            className="chooser-option"
            onClick={() => {
              setChoice(null);
              setTaskAt({ date: choice.date, time: hhmm(choice.from) });
            }}
          >
            <span className="chooser-icon">☑</span>
            <strong>Task</strong>
            <span className="small muted">Something to tick off at {formatTime12(hhmm(choice.from))}</span>
          </button>
        </div>
      </div>
    </div>
  );

  const taskDialog = taskAt && (
    <TaskDialog
      date={taskAt.date}
      time={taskAt.time}
      identities={data.identities}
      onClose={() => setTaskAt(null)}
      onSaved={() => {
        setTaskAt(null);
        void reload();
      }}
    />
  );

  const dialog = draft && (
    <BlockDialog
      draft={draft}
      identities={data.identities}
      series={data.series}
      onClose={() => setDraft(null)}
      onSaved={() => {
        setDraft(null);
        void reload();
      }}
    />
  );

  // ---------------------------------------------------------------- month view
  if (view === 'month') {
    const cells = Array.from({ length: Math.round((Date.parse(range.to) - Date.parse(range.from)) / 864e5) + 1 }, (_, i) => addDays(range.from, i));
    const month = at.slice(0, 7);
    return (
      <div className="stack">
        {header}
        {problem && <ErrorBox message={problem} />}
        <div className="card cal-month" style={{ padding: 0 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <div key={w} className="cal-month-head">
              {weekdayName(w)}
            </div>
          ))}
          {cells.map((d) => {
            const blocks = data.blocks.filter((b) => b.date === d);
            const tasks = data.tasks.filter((t) => t.date === d);
            const items = [...blocks.map((b) => ({ key: b.id, start: b.start, label: b.title, color: b.color as string, done: false, block: b })), ...tasks.map((t) => ({ key: t.id, start: t.time, label: t.title, color: 'task', done: t.done, block: null }))].sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={d} className={`cal-month-cell${d.slice(0, 7) !== month ? ' other' : ''}${d === today ? ' today' : ''}`}>
                <button type="button" className="cal-month-day" onClick={() => (setFocus(d), setView('day'))} aria-label={`Open ${formatLongDate(d)}`}>
                  {Number(d.slice(8))}
                </button>
                {items.slice(0, 3).map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    className={`cal-chip ${it.color}${it.done ? ' done' : ''}`}
                    title={`${formatTime12(it.start)} ${it.label}`}
                    onClick={() =>
                      it.block && canEdit
                        ? setDraft({ id: it.block.id, title: it.block.title, localDate: it.block.date, startTime: it.block.start, endTime: it.block.end, color: it.block.color, identityId: it.block.identityId, notes: it.block.notes, seriesId: it.block.seriesId })
                        : (setFocus(d), setView('day'))
                    }
                  >
                    <span className="small">{formatTime12(it.start).replace(':00', '')}</span> {it.label}
                  </button>
                ))}
                {items.length > 3 && (
                  <button type="button" className="cal-more" onClick={() => (setFocus(d), setView('day'))}>
                    +{items.length - 3} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {dialog}
        {chooser}
        {taskDialog}
      </div>
    );
  }

  // ---------------------------------------------------------------- day / week grid
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <div className="stack">
      {header}
      <p className="small muted" style={{ margin: 0 }}>
        {canEdit
          ? 'Drag on empty time to create a block. Drag a block to move it (even to another day), or its bottom edge to resize. Click a block to edit.'
          : 'Time blocks and timed tasks. Read-only.'}
        {data.google.connected && ' Synced with Google Calendar.'}
      </p>
      {problem && <ErrorBox message={problem} />}
      {narrow && view === 'week' && <p className="small muted" style={{ margin: 0 }}>Tip: the Day view is easier on a phone.</p>}

      <div className="card cal" style={{ padding: 0 }}>
        <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <button key={d} type="button" className={`cal-day-head${d === today ? ' today' : ''}`} onClick={() => (setFocus(d), setView('day'))}>
              <span className="small muted">{weekdayName(weekdayOf(d))}</span>
              <strong>{Number(d.slice(8))}</strong>
            </button>
          ))}
        </div>
        <div
          ref={body}
          className={`cal-body${drag ? ' dragging' : ''}`}
          style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="cal-gutter" style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR }}>
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
              <div key={i} className="cal-hour-label" style={{ top: i * HOUR }}>
                {i === 0 ? '' : hourLabel(FIRST_HOUR + i)}
              </div>
            ))}
          </div>
          {days.map((d, dayIndex) => {
            // While moving, the dragged block is drawn where it would land.
            const blocks = data.blocks
              .filter((b) => !(drag && drag.kind !== 'create' && drag.block.id === b.id))
              .filter((b) => b.date === d);
            const ghost =
              drag?.kind === 'move' && drag.day === dayIndex
                ? { ...drag.block, start: hhmm(drag.start), end: hhmm(Math.min(drag.start + mins(drag.block.end) - mins(drag.block.start), 24 * 60 - 1)) }
                : drag?.kind === 'resize' && drag.block.date === d
                  ? { ...drag.block, end: hhmm(drag.end) }
                  : null;
            const items: Item[] = [
              ...blocks.map((b) => ({ kind: 'block' as const, b, start: mins(b.start), end: mins(b.end) })),
              ...(ghost ? [{ kind: 'block' as const, b: ghost, start: mins(ghost.start), end: mins(ghost.end) }] : []),
              ...data.tasks.filter((t) => t.date === d).map((t) => ({ kind: 'task' as const, t, start: mins(t.time), end: Math.min(mins(t.time) + 30, 24 * 60) })),
            ];
            const top = (m: number) => ((Math.max(m, FIRST_HOUR * 60) - FIRST_HOUR * 60) / 60) * HOUR;
            return (
              <div
                key={d}
                className={`cal-col${canEdit ? ' editable' : ''}`}
                style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR }}
                onPointerDown={(e) => {
                  if (!canEdit || e.button !== 0 || e.target !== e.currentTarget) return;
                  const p = pointAt(e.clientX, e.clientY);
                  const m = Math.floor(p.minute / SNAP) * SNAP;
                  (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ kind: 'create', day: dayIndex, from: m, to: m });
                }}
              >
                {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
                  <div key={i} className="cal-hour-line" style={{ top: i * HOUR }} />
                ))}
                {layout(items).map(({ item, col, cols }) => {
                  const t0 = top(item.start);
                  const height = Math.max(18, ((item.end - Math.max(item.start, FIRST_HOUR * 60)) / 60) * HOUR - 2);
                  const style = { top: t0, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
                  if (item.kind === 'block') {
                    const b = item.b;
                    const isGhost = !!ghost && b === ghost;
                    return (
                      <div
                        key={isGhost ? 'ghost' : b.id}
                        role="button"
                        tabIndex={0}
                        className={`cal-block ${b.color}${isGhost ? ' ghost' : ''}${canEdit ? ' draggable' : ''}`}
                        style={style}
                        title={[b.title, `${formatTime12(b.start)} – ${formatTime12(b.end)}`, b.identity, b.notes].filter(Boolean).join('\n')}
                        onKeyDown={(e) => {
                          if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setDraft({ id: b.id, title: b.title, localDate: b.date, startTime: b.start, endTime: b.end, color: b.color, identityId: b.identityId, notes: b.notes, seriesId: b.seriesId });
                          }
                        }}
                        onPointerDown={(e) => {
                          if (!canEdit || e.button !== 0) return;
                          e.stopPropagation();
                          const p = pointAt(e.clientX, e.clientY);
                          (body.current as HTMLElement).setPointerCapture(e.pointerId);
                          const resize = (e.target as HTMLElement).classList.contains('cal-resize');
                          setDrag(resize ? { kind: 'resize', block: b, end: mins(b.end), moved: false } : { kind: 'move', block: b, grabOffset: p.minute - mins(b.start), day: dayIndex, start: mins(b.start), moved: false });
                        }}
                      >
                        <strong>{b.title}</strong>
                        {height > 34 && (
                          <span>
                            {formatTime12(b.start)} – {formatTime12(b.end)}
                          </span>
                        )}
                        {canEdit && <span className="cal-resize" aria-hidden="true" />}
                      </div>
                    );
                  }
                  const t = item.t;
                  return (
                    <div key={t.id} className={`cal-task${t.done ? ' done' : ''}`} style={style} title={`${t.title} · ${formatTime12(t.time)}${t.identity ? ` · ${t.identity}` : ''}`}>
                      {t.done ? '✅' : '⬜'} {t.title}
                    </div>
                  );
                })}
                {drag?.kind === 'create' && drag.day === dayIndex && (
                  <div className="cal-block sage ghost" style={{ top: top(Math.min(drag.from, drag.to)), height: Math.max(12, (Math.abs(drag.to - drag.from) / 60) * HOUR), left: 2, right: 2 }}>
                    <strong>New block</strong>
                    <span>
                      {formatTime12(hhmm(Math.min(drag.from, drag.to)))} – {formatTime12(hhmm(Math.max(drag.from, drag.to, Math.min(drag.from, drag.to) + SNAP)))}
                    </span>
                  </div>
                )}
                {d === today && nowMin >= FIRST_HOUR * 60 && <div className="cal-now" style={{ top: top(nowMin) }} />}
              </div>
            );
          })}
        </div>
      </div>
      {dialog}
      {chooser}
      {taskDialog}
    </div>
  );
}

/** Calendar data with a setter for optimistic updates while dragging. */
function useCalendar(from: string, to: string) {
  const { data, error, reload } = useApi<DashboardCalendar>(`/calendar?from=${from}&to=${to}`);
  const [local, setLocal] = useState<DashboardCalendar | null>(null);
  useEffect(() => setLocal(data), [data]);
  return { data: local ?? data, error, reload, setData: setLocal as (fn: (d: DashboardCalendar | null) => DashboardCalendar | null) => void };
}

/** Quick task at a time, from the calendar (a planner task, shown as a task block). */
function TaskDialog({
  date,
  time,
  identities,
  onClose,
  onSaved,
}: {
  date: string;
  time: string;
  identities: DashboardCalendar['identities'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [localDate, setLocalDate] = useState(date);
  const [localTime, setLocalTime] = useState(time);
  const [identityId, setIdentityId] = useState('');
  const [twoMinute, setTwoMinute] = useState('');
  const [repeat, setRepeat] = useState<RepeatChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (repeat) {
        await api.post('/owner/series', {
          kind: 'task',
          startDate: localDate,
          fields: { title: title.trim(), startTime: localTime || null, endTime: null, color: null, identityId: identityId || null, twoMinute: twoMinute.trim() || null },
          repeat,
        });
        return onSaved();
      }
      await save('planTasks', {
        id: newId(),
        title: title.trim(),
        localDate,
        identityId: identityId || null,
        goalId: null,
        localTime: localTime || null,
        place: null,
        twoMinute: twoMinute.trim() || null,
        completedAt: null,
        displayOrder: 0,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="New task" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>New task</h2>
        <form
          className="stack"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void submit();
          }}
        >
          <label className="field">
            Task
            <input autoFocus type="text" value={title} maxLength={200} placeholder="e.g. Read 20 pages" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: '1 1 140px' }}>
              Day
              <input type="date" value={localDate} onChange={(e) => e.target.value && setLocalDate(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 110px' }}>
              Time
              <input type="time" step={300} value={localTime} onChange={(e) => setLocalTime(e.target.value)} />
            </label>
          </div>
          {identities.length > 0 && (
            <label className="field">
              Who does this make you?
              <select value={identityId} onChange={(e) => setIdentityId(e.target.value)}>
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
            2-minute version (optional)
            <input type="text" value={twoMinute} maxLength={200} placeholder="e.g. Open the book" onChange={(e) => setTwoMinute(e.target.value)} />
          </label>
          <RepeatField date={localDate} value={repeat} onChange={setRepeat} />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !title.trim()}>
              {busy ? 'Saving…' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
