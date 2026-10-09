import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  MOOD_OPTIONS,
  addDays,
  formatLongDate,
  formatTime12,
  type PlanTaskRecord,
  type UrgeRecord,
} from '@journal/shared';
import { errorMessage } from '../api';
import { Card, Empty, ErrorBox, Loading, Progress } from '../components/ui';
import {
  ConflictError,
  habitsForDate,
  journalDay,
  newId,
  remove,
  save,
  saveAnswer,
  setHabitValue,
  upsertLocal,
  useOwnerData,
  type DayQuestion,
  type OwnerData,
  type OwnerRecords,
} from '../owner/store';
import { UrgeDialog } from '../owner/UrgeDialog';

type Setter = (fn: (r: OwnerRecords) => OwnerRecords) => void;

// ------------------------------------------------------------------ journal

function TextAnswer({ q, onSave }: { q: DayQuestion; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(q.answer?.textValue ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const saved = useRef(q.answer?.textValue ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = async (value: string) => {
    clearTimeout(timer.current);
    if (value === saved.current) return;
    setState('saving');
    try {
      await onSave(value);
      saved.current = value;
      setState('saved');
      setMsg(null);
    } catch (e) {
      setState('error');
      setMsg(e instanceof ConflictError ? e.message : errorMessage(e));
    }
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <label className="field">
      <span className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          {q.text}
          {q.isRequired && ' *'}
        </span>
        <span className="small muted" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : ''}
        </span>
      </span>
      <textarea
        rows={q.systemKey === 'day' ? 6 : 3}
        value={text}
        placeholder="Write freely…"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setState('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(v), 1200);
        }}
        onBlur={() => void flush(text)}
      />
      {msg && <div className="error">{msg}</div>}
    </label>
  );
}

function Journal({ data, date, set }: { data: OwnerData; date: string; set: Setter }) {
  const questions = journalDay(data.records, data.userId, date);
  const [error, setError] = useState<string | null>(null);
  const store = async (q: DayQuestion, value: { textValue?: string | null; emojiValue?: number | null }) => {
    const a = await saveAnswer(data.records, data.userId, date, q, value);
    set((r) => upsertLocal(r, 'journalAnswers', a));
  };
  return (
    <Card title="Journal">
      <div className="stack" style={{ gap: 18 }}>
        {questions.map((q) =>
          q.type === 'emoji' ? (
            <div key={q.questionId} className="field">
              {q.text}
              <div className="row" role="radiogroup" aria-label={q.text}>
                {MOOD_OPTIONS.map((m) => {
                  const on = q.answer?.emojiValue === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={m.label}
                      className={`mood-btn${on ? ' on' : ''}`}
                      onClick={() => {
                        setError(null);
                        store(q, { emojiValue: on ? null : m.value }).catch((e) => setError(errorMessage(e)));
                      }}
                    >
                      <span aria-hidden="true">{m.emoji}</span>
                      <span className="small">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <TextAnswer key={`${date}:${q.questionId}`} q={q} onSave={(t) => store(q, { textValue: t })} />
          ),
        )}
        {error && <ErrorBox message={error} />}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ habits

function Habits({ data, date, set }: { data: OwnerData; date: string; set: Setter }) {
  const items = habitsForDate(data.records, date);
  const [error, setError] = useState<string | null>(null);
  const store = (h: (typeof items)[number], v: number) => {
    setError(null);
    setHabitValue(data.userId, h, date, v)
      .then((log) => set((r) => upsertLocal(r, 'habitLogs', log)))
      .catch((e) => setError(errorMessage(e)));
  };
  const done = items.filter((h) => h.progress >= 100).length;
  return (
    <Card title="Habits" right={items.length ? <span className={`badge${done === items.length ? ' active' : ''}`}>{done}/{items.length}</span> : undefined}>
      {items.length === 0 ? (
        <Empty>No habits scheduled for this day.</Empty>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {items.map((h) => (
            <div key={h.habit.id}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                {h.type === 'boolean' ? (
                  <label className="row" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" className="big-check" checked={h.value >= 1} onChange={(e) => store(h, e.target.checked ? 1 : 0)} />
                    <strong>{h.habit.name}</strong>
                  </label>
                ) : (
                  <strong>{h.habit.name}</strong>
                )}
                {h.type !== 'boolean' && (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button type="button" className="btn" aria-label={`Less ${h.habit.name}`} onClick={() => store(h, Math.max(0, h.value - (h.type === 'duration' ? 5 : 1)))}>
                      −
                    </button>
                    <input
                      key={`${date}:${h.value}`}
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={h.value}
                      aria-label={`${h.habit.name} value`}
                      style={{ width: 80, textAlign: 'center' }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== h.value) store(h, v);
                      }}
                    />
                    <button type="button" className="btn" aria-label={`More ${h.habit.name}`} onClick={() => store(h, h.value + (h.type === 'duration' ? 5 : 1))}>
                      +
                    </button>
                    <span className="small muted" style={{ minWidth: 90 }}>
                      / {h.target} {h.unit ?? ''}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 6 }}>
                <Progress percent={h.progress} label={`${h.habit.name} progress`} />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

// ------------------------------------------------------------------ tasks

function Tasks({ data, date, set }: { data: OwnerData; date: string; set: Setter }) {
  const tasks = data.records.planTasks
    .filter((t) => t.localDate === date)
    .sort((a, b) => (a.localTime ?? '99').localeCompare(b.localTime ?? '99') || a.displayOrder - b.displayOrder);
  const identities = data.records.identities.filter((i) => i.isActive);
  const yesterday = addDays(date, -1);
  const titlesToday = new Set(tasks.map((t) => t.title.trim().toLowerCase()));
  const missed = date === data.today ? data.records.planTasks.filter((t) => t.localDate === yesterday && !t.completedAt && !titlesToday.has(t.title.trim().toLowerCase())) : [];
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [twoMinute, setTwoMinute] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const put = (rec: Record<string, unknown>) =>
    save<PlanTaskRecord>('planTasks', rec)
      .then((t) => set((r) => upsertLocal(r, 'planTasks', t)))
      .catch((e) => setError(errorMessage(e)));

  const add = async (t: Partial<PlanTaskRecord> & { title: string }) => {
    setError(null);
    await put({
      id: newId(),
      localDate: date,
      identityId: null,
      goalId: null,
      localTime: null,
      place: null,
      twoMinute: null,
      completedAt: null,
      displayOrder: tasks.length,
      ...t,
    });
  };

  return (
    <Card title="Tasks">
      {missed.length > 0 && (
        <div className="notice">
          <strong>Never miss twice.</strong> Not finished yesterday:
          {missed.map((m) => (
            <div key={m.id} className="row" style={{ marginTop: 6 }}>
              <span style={{ flex: 1 }}>{m.title}</span>
              <button type="button" className="btn" onClick={() => void add({ title: m.title, identityId: m.identityId, goalId: m.goalId, localTime: m.localTime, place: m.place, twoMinute: m.twoMinute })}>
                Do it today
              </button>
              {m.twoMinute && (
                <button type="button" className="btn" onClick={() => void add({ title: m.twoMinute!, identityId: m.identityId, goalId: m.goalId, localTime: m.localTime })}>
                  Just: {m.twoMinute}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {tasks.length === 0 ? (
        <Empty>Nothing planned yet. Keep it small: one task that proves who you're becoming.</Empty>
      ) : (
        <ul className="task-list">
          {tasks.map((t) => {
            const who = identities.find((i) => i.id === t.identityId) ?? data.records.identities.find((i) => i.id === t.identityId);
            return (
              <li key={t.id}>
                <input
                  type="checkbox"
                  className="big-check"
                  checked={!!t.completedAt}
                  aria-label={t.title}
                  onChange={(e) => {
                    void put({ ...t, completedAt: e.target.checked ? new Date().toISOString() : null }).then(() =>
                      setNotice(e.target.checked ? (who ? `+1 vote for "${who.statement}" 🌱` : 'Nice. Done! 🌱') : null),
                    );
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ textDecoration: t.completedAt ? 'line-through' : 'none', fontWeight: 600 }}>{t.title}</div>
                  <div className="small muted">
                    {[t.localTime && `🕒 ${formatTime12(t.localTime.slice(0, 5))}`, who && `🪪 ${who.statement}`, t.twoMinute && `⏱ ${t.twoMinute}`].filter(Boolean).join('   ')}
                  </div>
                </div>
                <button type="button" className="btn link" aria-label={`Delete ${t.title}`} onClick={() => remove('planTasks', t).then(() => set((r) => ({ ...r, planTasks: r.planTasks.filter((x) => x.id !== t.id) })))}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {notice && <div className="small" style={{ color: 'var(--success)', fontWeight: 600 }}>{notice}</div>}
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void add({ title: title.trim(), localTime: time || null, identityId: identityId || null, twoMinute: twoMinute.trim() || null }).then(() => {
            setTitle('');
            setTime('');
            setTwoMinute('');
          });
        }}
      >
        <input type="text" placeholder="Add a task…" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} style={{ flex: '2 1 200px' }} />
        <input type="time" aria-label="Time (optional)" value={time} onChange={(e) => setTime(e.target.value)} />
        {identities.length > 0 && (
          <select aria-label="Identity" value={identityId} onChange={(e) => setIdentityId(e.target.value)}>
            <option value="">Who does this make you?</option>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.statement}
              </option>
            ))}
          </select>
        )}
        <input type="text" placeholder="2-minute version (optional)" value={twoMinute} maxLength={200} onChange={(e) => setTwoMinute(e.target.value)} style={{ flex: '1 1 160px' }} />
        <button className="btn primary" disabled={!title.trim()}>
          Add
        </button>
      </form>
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

// ------------------------------------------------------------------ urges

function Urges({ data, date, set }: { data: OwnerData; date: string; set: Setter }) {
  const urges = data.records.urges.filter((u) => u.localDate === date).sort((a, b) => a.localTime.localeCompare(b.localTime));
  const [editing, setEditing] = useState<UrgeRecord | 'new' | null>(null);
  return (
    <Card title="Urges" right={<button className="btn primary" type="button" onClick={() => setEditing('new')}>+ Log an urge</button>}>
      {urges.length === 0 ? (
        <Empty>No urges recorded this day.</Empty>
      ) : (
        <ul className="task-list">
          {urges.map((u) => (
            <li key={u.id}>
              <span className="badge">{formatTime12(u.localTime.slice(0, 5))}</span>
              <div style={{ flex: 1 }}>
                <strong>Intensity {u.intensity}/10</strong>
                {u.durationMinutes !== null && u.durationMinutes !== undefined && <span className="muted"> · {u.durationMinutes} min</span>}
                <div className="small muted">{[u.triggerText, u.emotionBefore].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" className="btn" onClick={() => setEditing(u)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <UrgeDialog
          date={date}
          urge={editing === 'new' ? null : editing}
          emotions={data.records.emotionOptions.map((e) => e.name)}
          onClose={() => setEditing(null)}
          onSaved={(u, deleted) => {
            setEditing(null);
            set((r) => (deleted ? { ...r, urges: r.urges.filter((x) => x.id !== u.id) } : upsertLocal(r, 'urges', u as OwnerRecords['urges'][number])));
          }}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ page

export function Today() {
  const params = useParams<{ date?: string }>();
  const nav = useNavigate();
  const [today] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const { data, error } = useOwnerData(addDays(date, -1), date);
  const [records, setRecords] = useState<OwnerRecords | null>(null);
  useEffect(() => setRecords(data?.records ?? null), [data]);

  if (error) return <ErrorBox message={error} />;
  if (!data || !records) return <Loading />;
  const live: OwnerData = { ...data, records };
  const set: Setter = (fn) => setRecords((r) => (r ? fn(r) : r));
  const go = (d: string) => nav(d === data.today ? '/today' : `/today/${d}`);
  const label = date === data.today ? 'Today' : date === addDays(data.today, -1) ? 'Yesterday' : date === addDays(data.today, 1) ? 'Tomorrow' : null;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{label ?? formatLongDate(date)}</h1>
          {label && <div className="muted">{formatLongDate(date)}</div>}
        </div>
        <div className="row">
          <button className="btn" type="button" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
            ←
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Pick a day" />
          <button className="btn" type="button" aria-label="Next day" onClick={() => go(addDays(date, 1))}>
            →
          </button>
          {date !== data.today && (
            <button className="btn" type="button" onClick={() => go(data.today)}>
              Today
            </button>
          )}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Everything here saves as you go and reaches your phone on its next sync.
      </p>
      <div className="grid two">
        <div className="stack">
          <Habits data={live} date={date} set={set} />
          <Tasks data={live} date={date} set={set} />
        </div>
        <div className="stack">
          <Journal key={date} data={live} date={date} set={set} />
          <Urges data={live} date={date} set={set} />
        </div>
      </div>
    </div>
  );
}
