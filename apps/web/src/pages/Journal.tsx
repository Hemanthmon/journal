import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatLongDate, formatShortDate, type DayDetail, type DaySummary, type Highlight, type HighlightInput, type ResolvedRange } from '@journal/shared';
import { api, errorMessage, useApi } from '../api';
import { useMe } from '../session';
import { DiaryPage } from '../components/DiaryPage';
import { Card, Empty, ErrorBox, Loading, Mood, pct } from '../components/ui';
import { useRange } from '../range';

/**
 * Routine & journal, read like a diary: one day per page, newest first, with previous /
 * next (buttons or ← → keys) and a jump list. A list view of all days is one click away.
 */
export function Journal() {
  const r = useRange();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'pages';
  const { data, error, loading } = useApi<{ range: ResolvedRange; days: DaySummary[] }>(r.withRange('/days'));

  // Pages in reading order: oldest first (page 1), the newest is the last page.
  const pages = data ? [...data.days].reverse() : [];
  const asked = params.get('date');
  const index = pages.length ? Math.max(0, asked ? pages.findIndex((d) => d.date === asked) : pages.length - 1) : -1;
  const current = index >= 0 ? pages[index] : undefined;
  const { data: day, error: dayError } = useApi<DayDetail>(view === 'pages' && current ? `/days/${current.date}` : null);
  const me = useMe();
  const { data: highlights, reload: reloadHighlights } = useApi<Highlight[]>(
    view === 'pages' && current ? `/highlights?from=${current.date}&to=${current.date}` : null,
  );
  const highlight = async (h: HighlightInput) => {
    try {
      await api.post('/highlights', h);
    } catch (e) {
      throw new Error(errorMessage(e));
    }
    await reloadHighlights();
  };
  const unhighlight = async (id: string) => {
    try {
      await api.delete(`/highlights/${id}`);
    } catch (e) {
      throw new Error(errorMessage(e));
    }
    await reloadHighlights();
  };

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value === null) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );
  const goTo = (i: number) => pages[i] && setParam('date', pages[i]!.date);

  // ← → turn the pages (unless typing in a field).
  useEffect(() => {
    if (view !== 'pages') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'ArrowRight') goTo(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1 style={{ margin: 0 }}>Daily routine &amp; journal</h1>
      <div className="seg" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={view === 'pages'} className={view === 'pages' ? 'on' : ''} onClick={() => setParam('view', null)}>
          📖 Pages
        </button>
        <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setParam('view', 'list')}>
          ☰ List
        </button>
      </div>
    </div>
  );

  if (error) return <div className="stack">{header}<ErrorBox message={error} /></div>;
  if (loading || !data) return <div className="stack">{header}<Loading /></div>;
  if (pages.length === 0) return <div className="stack">{header}<Card><Empty>Nothing recorded in this period. Try a longer date range above.</Empty></Card></div>;

  if (view === 'list') {
    // Open that day as a page (keeps the date range, leaves list view).
    const open = (date: string) => {
      const p = new URLSearchParams(params);
      p.delete('view');
      p.set('date', date);
      nav({ pathname: '/journal', search: `?${p}` });
    };
    return (
      <div className="stack">
        {header}
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Habits</th>
                  <th>Mood</th>
                  <th>Journal answers</th>
                  <th>Urges</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className="clickable" tabIndex={0} onClick={() => open(d.date)} onKeyDown={(e) => e.key === 'Enter' && open(d.date)}>
                    <td>
                      <strong>{formatShortDate(d.date)}</strong>
                      <div className="small muted">{d.weekday}</div>
                    </td>
                    <td>{d.habitsScheduled ? `${d.habitsCompleted}/${d.habitsScheduled} · ${pct(d.habitPercent)}` : <span className="muted">—</span>}</td>
                    <td>
                      <Mood value={d.mood} />
                    </td>
                    <td>{d.answered || <span className="muted">—</span>}</td>
                    <td>{d.urges || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  const prev = pages[index - 1];
  const next = pages[index + 1];
  return (
    <div className="stack">
      {header}
      <nav className="diary-nav" aria-label="Pages">
        <button type="button" className="btn" disabled={!prev} onClick={() => goTo(index - 1)} title="Previous page (←)">
          ← {prev ? formatShortDate(prev.date) : 'Previous'}
        </button>
        <label className="diary-jump">
          <span className="small muted">
            Page {index + 1} of {pages.length}
          </span>
          <select value={current!.date} onChange={(e) => setParam('date', e.target.value)} aria-label="Jump to a day">
            {[...pages].reverse().map((d) => (
              <option key={d.date} value={d.date}>
                {formatLongDate(d.date)}
                {d.answered ? '' : ' (no writing)'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" disabled={!next} onClick={() => goTo(index + 1)} title="Next page (→)">
          {next ? formatShortDate(next.date) : 'Next'} →
        </button>
      </nav>

      {dayError ? <ErrorBox message={dayError} /> : !day || day.date !== current!.date ? <Loading /> : (
        <DiaryPage
          day={day}
          highlights={(highlights ?? []).filter((h) => h.date === day.date)}
          canRemoveAny={me.isOwner}
          onHighlight={highlight}
          onRemove={unhighlight}
        />
      )}

      <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
        Tip: use ← and → to turn pages, and select words to highlight them. Pages follow the date range at the top.{' '}
        <Link to={{ pathname: `/day/${current!.date}`, search: r.search }}>Full details for this day</Link>
      </p>
    </div>
  );
}
