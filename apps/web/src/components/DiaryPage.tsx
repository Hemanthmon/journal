import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatLongDate, formatUrgeDuration, moodOption, type DayDetail, type Highlight, type HighlightInput } from '@journal/shared';
import { Mood, Outcome, time12, yesNo } from './ui';

type Popover =
  | { kind: 'new'; x: number; y: number; questionId: string; quote: string; start: number; end: number }
  | { kind: 'show'; x: number; y: number; highlight: Highlight };

/** Splits `text` into plain runs and highlighted runs (overlaps merged into the first). */
function marked(text: string, hs: Highlight[], onOpen: (h: Highlight, el: HTMLElement) => void): ReactNode[] {
  const spans = hs
    .map((h) => {
      // Use the saved position if the words are still there, else find the words again.
      if (h.start != null && h.end != null && text.slice(h.start, h.end) === h.quote) return { h, s: h.start, e: h.end };
      const at = h.quote ? text.indexOf(h.quote) : -1;
      return at >= 0 ? { h, s: at, e: at + h.quote!.length } : null;
    })
    .filter((x): x is { h: Highlight; s: number; e: number } => !!x)
    .sort((a, b) => a.s - b.s);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const { h, s, e } of spans) {
    if (s < pos) continue;
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <mark
        key={h.id}
        className={`hl${h.authorIsOwner ? ' owner' : ''}`}
        tabIndex={0}
        title={`${h.author}${h.note ? `: ${h.note}` : ''}`}
        onClick={(ev) => onOpen(h, ev.currentTarget)}
        onKeyDown={(ev) => ev.key === 'Enter' && onOpen(h, ev.currentTarget)}
      >
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/**
 * One day of the journal laid out like a diary page: the written answers first, then the
 * day's urges in full, then habits. Select words to highlight them (with a note); click
 * a highlight to see who made it.
 */
export function DiaryPage({
  day,
  highlights,
  canRemoveAny,
  onHighlight,
  onRemove,
}: {
  day: DayDetail;
  highlights: Highlight[];
  canRemoveAny: boolean;
  onHighlight: (h: HighlightInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const mood = moodOption(day.mood);
  const written = day.answers.filter((a) => a.type === 'text' && a.textValue?.trim());
  const done = day.habits.filter((h) => h.completed).length;
  const [pop, setPop] = useState<Popover | null>(null);
  const [note, setNote] = useState('');
  const [urgeNote, setUrgeNote] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !popRef.current?.contains(e.target as Node)) setPop(null);
    };
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('keydown', close);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [pop]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPop(null);
      setNote('');
      setUrgeNote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  /** After selecting words inside an answer: offer to highlight them. */
  const onSelect = (questionId: string, el: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const raw = range.toString();
    const lead = raw.length - raw.trimStart().length;
    const quote = raw.trim();
    if (!quote) return;
    const start = before.toString().length + lead;
    const rect = range.getBoundingClientRect();
    setNote('');
    setError(null);
    setPop({ kind: 'new', x: rect.left + rect.width / 2, y: rect.bottom + 8, questionId, quote: quote.slice(0, 2000), start, end: start + quote.length });
  };

  const openMark = (h: Highlight, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setError(null);
    setPop({ kind: 'show', x: r.left + r.width / 2, y: r.bottom + 8, highlight: h });
  };

  const forTarget = (kind: Highlight['kind'], id: string) => highlights.filter((h) => h.kind === kind && h.targetId === id);

  return (
    <article className="diary-page" aria-label={`Journal for ${formatLongDate(day.date)}`}>
      <header className="diary-head">
        <div>
          <div className="diary-weekday">{day.weekday}</div>
          <h2 className="diary-date">{formatLongDate(day.date).replace(/^\w+, /, '')}</h2>
        </div>
        <div className="diary-chips">
          {mood && (
            <span className="diary-chip" title={mood.label}>
              <span aria-hidden="true">{mood.emoji}</span> {mood.label}
            </span>
          )}
          {day.habits.length > 0 && (
            <span className={`diary-chip${done === day.habits.length ? ' good' : ''}`}>
              ✓ Habits {done}/{day.habits.length}
            </span>
          )}
          {day.urges.length > 0 && <span className="diary-chip">〰 {day.urges.length} urge{day.urges.length === 1 ? '' : 's'}</span>}
          {highlights.length > 0 && <span className="diary-chip hl-chip">🖍 {highlights.length}</span>}
        </div>
      </header>

      {written.length === 0 ? (
        <p className="diary-empty">Nothing was written on this day.</p>
      ) : (
        <>
          {written.map((a) => (
            <section key={a.questionId} className="diary-entry">
              <h3>{a.question}</h3>
              <p onMouseUp={(e) => onSelect(a.questionId, e.currentTarget)} onKeyUp={(e) => onSelect(a.questionId, e.currentTarget)}>
                {marked(a.textValue!, forTarget('answer', a.questionId), openMark)}
              </p>
            </section>
          ))}
          <p className="diary-hint">Select words to highlight them.</p>
        </>
      )}

      {day.answers
        .filter((a) => a.type === 'emoji' && a.emojiValue !== null && a.systemKey !== 'mood')
        .map((a) => (
          <section key={a.questionId} className="diary-entry">
            <h3>{a.question}</h3>
            <p>
              <Mood value={a.emojiValue} withLabel />
            </p>
          </section>
        ))}

      {day.urges.length > 0 && (
        <section className="diary-urges">
          <h3 className="diary-section-title">Urges</h3>
          {day.urges.map((u) => {
            const hs = forTarget('urge', u.id);
            const mineAlready = hs.some((h) => h.mine);
            return (
              <div key={u.id} className={`urge-card${hs.length ? ' highlighted' : ''}`}>
                <div className="urge-card-head">
                  <strong>{time12(u.localTime)}</strong>
                  <Outcome diverted={u.diverted} />
                  <span className="muted small">{formatUrgeDuration(u.durationMinutes)}</span>
                  <span style={{ flex: 1 }} />
                  {!mineAlready &&
                    (urgeNote?.id === u.id ? (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(() => onHighlight({ kind: 'urge', date: day.date, targetId: u.id, note: urgeNote.text.trim() || null }));
                        }}
                      >
                        <input autoFocus type="text" maxLength={500} placeholder="Note (optional)" value={urgeNote.text} onChange={(e) => setUrgeNote({ id: u.id, text: e.target.value })} />
                        <button className="btn primary" disabled={busy}>
                          Save
                        </button>
                        <button type="button" className="btn link" onClick={() => setUrgeNote(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="btn" onClick={() => setUrgeNote({ id: u.id, text: '' })}>
                        🖍 Highlight
                      </button>
                    ))}
                </div>
                <div className="urge-intensity" aria-label={`Intensity ${u.intensity} out of 10`}>
                  <span className="small muted">Intensity</span>
                  <div className="urge-bar">
                    <span style={{ width: `${u.intensity * 10}%` }} />
                  </div>
                  <strong>{u.intensity}/10</strong>
                </div>
                <dl className="urge-facts">
                  {u.triggerText && (
                    <>
                      <dt>Trigger</dt>
                      <dd>{u.triggerText}</dd>
                    </>
                  )}
                  {u.emotionBefore && (
                    <>
                      <dt>Feeling before</dt>
                      <dd>{u.emotionBefore}</dd>
                    </>
                  )}
                  {u.actionTaken && (
                    <>
                      <dt>What I did</dt>
                      <dd>{u.actionTaken}</dd>
                    </>
                  )}
                  {u.outcome && (
                    <>
                      <dt>What happened after</dt>
                      <dd>{u.outcome}</dd>
                    </>
                  )}
                  <dt>Watched content</dt>
                  <dd>{yesNo(u.explicitContent)}</dd>
                  <dt>Masturbated</dt>
                  <dd>{yesNo(u.masturbated)}</dd>
                  {u.remarks && (
                    <>
                      <dt>Remarks</dt>
                      <dd>{u.remarks}</dd>
                    </>
                  )}
                </dl>
                {hs.length > 0 && (
                  <ul className="urge-hls">
                    {hs.map((h) => (
                      <li key={h.id}>
                        <span className="hl-dot" aria-hidden="true">🖍</span> <strong>{h.author}</strong>
                        {h.note ? `: ${h.note}` : ' highlighted this'}
                        {(h.mine || canRemoveAny) && (
                          <button type="button" className="btn link small" onClick={() => void run(() => onRemove(h.id))}>
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {day.habits.length > 0 && (
        <footer className="diary-foot">
          <div>
            <h4>Habits</h4>
            <ul>
              {day.habits.map((h) => (
                <li key={h.habitId} className={h.completed ? 'done' : ''}>
                  <span aria-hidden="true">{h.completed ? '✓' : '○'}</span> {h.name}
                  {h.type !== 'boolean' && (
                    <span className="muted">
                      {' '}
                      · {h.value}/{h.target} {h.unit ?? ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {highlights.some((h) => h.kind === 'answer') && (
            <div>
              <h4>Highlights</h4>
              <ul>
                {highlights
                  .filter((h) => h.kind === 'answer')
                  .map((h) => (
                    <li key={h.id}>
                      <mark className={`hl${h.authorIsOwner ? ' owner' : ''}`}>“{h.quote}”</mark>
                      <div className="small muted">
                        {h.author}
                        {h.note ? `: ${h.note}` : ''}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </footer>
      )}

      {error && !pop && <div className="error" role="alert">{error}</div>}

      {pop && (
        <div ref={popRef} className="hl-pop" role="dialog" aria-label="Highlight" style={{ left: pop.x, top: pop.y }}>
          {pop.kind === 'new' ? (
            <form
              className="stack"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  onHighlight({ kind: 'answer', date: day.date, targetId: pop.questionId, quote: pop.quote, start: pop.start, end: pop.end, note: note.trim() || null }),
                ).then(() => window.getSelection()?.removeAllRanges());
              }}
            >
              <input autoFocus type="text" maxLength={500} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary" disabled={busy}>
                🖍 Highlight
              </button>
            </form>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div>
                <strong>{pop.highlight.author}</strong> <span className="small muted">{new Date(pop.highlight.createdAt).toLocaleString()}</span>
              </div>
              {pop.highlight.note ? <div>{pop.highlight.note}</div> : <div className="small muted">No note</div>}
              {(pop.highlight.mine || canRemoveAny) && (
                <button type="button" className="btn" disabled={busy} onClick={() => void run(() => onRemove(pop.highlight.id))}>
                  Remove highlight
                </button>
              )}
            </div>
          )}
          {error && <div className="error small">{error}</div>}
        </div>
      )}
    </article>
  );
}
