import { useSearchParams } from 'react-router';
import { addDays } from '@journal/shared';
import { useMe } from './session';

/**
 * The global date filter, kept in the URL (?range=7d or ?range=custom&from=..&to=..) so it
 * survives reloads and applies to every page and to the Excel export. Dates are computed
 * from "today" in the owner's time zone (from the server), not the browser's.
 */
export type Preset = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All records' },
  { key: 'custom', label: 'Custom' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function useRange() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const raw = params.get('range') as Preset | null;
  const preset: Preset = PRESETS.some((p) => p.key === raw) ? (raw as Preset) : '7d';
  const today = me.today;

  let from: string | undefined;
  let to: string | undefined = today;
  if (preset === 'today') from = today;
  else if (preset === '7d') from = addDays(today, -6);
  else if (preset === '30d') from = addDays(today, -29);
  else if (preset === 'month') from = `${today.slice(0, 7)}-01`;
  else if (preset === 'all') {
    from = undefined;
    to = undefined;
  } else {
    const f = params.get('from');
    const t = params.get('to');
    from = f && DATE.test(f) ? f : addDays(today, -6);
    to = t && DATE.test(t) ? t : today;
    if (from > to) [from, to] = [to, from];
  }

  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const qs = query.toString();

  const setPreset = (p: Preset) => {
    const next = new URLSearchParams(params);
    next.set('range', p);
    if (p === 'custom') {
      next.set('from', from ?? me.firstDate);
      next.set('to', to ?? today);
    } else {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  const setCustom = (f: string, t: string) => {
    const next = new URLSearchParams(params);
    next.set('range', 'custom');
    next.set('from', f);
    next.set('to', t);
    setParams(next, { replace: true });
  };

  /** Appends the current range to an API path. */
  const withRange = (path: string) => (qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path);

  /** Current page search string, to keep the filter when navigating. */
  const search = params.toString() ? `?${params.toString()}` : '';

  return { preset, from, to, qs, withRange, setPreset, setCustom, search, today };
}
