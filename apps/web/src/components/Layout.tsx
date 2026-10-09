import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '../api';
import { formatLongDate } from '@journal/shared';
import { PRESETS, useRange } from '../range';
import { useMe, useSession } from '../session';
import { THEMES, type Theme, useThemePref } from '../theme';

const NAV = [
  { to: '/today', label: 'Today', icon: '✍', end: false, ownerOnly: true },
  { to: '/', label: 'Overview', icon: '◎', end: true },
  { to: '/habits', label: 'Habits', icon: '✓', end: false },
  { to: '/journal', label: 'Routine & Journal', icon: '✎', end: false },
  { to: '/planner', label: 'Planner', icon: '❦', end: false },
  { to: '/calendar', label: 'Calendar', icon: '▦', end: false },
  { to: '/urges', label: 'Urge Tracker', icon: '〰', end: false },
];

function DateFilter() {
  const r = useRange();
  return (
    <div className="row" role="group" aria-label="Date range">
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`chip${r.preset === p.key ? ' on' : ''}`}
            aria-pressed={r.preset === p.key}
            onClick={() => r.setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {r.preset === 'custom' && r.from && r.to && (
        <div className="row">
          <label className="small muted">
            From{' '}
            <input type="date" value={r.from} max={r.today} onChange={(e) => e.target.value && r.setCustom(e.target.value, r.to!)} />
          </label>
          <label className="small muted">
            To <input type="date" value={r.to} max={r.today} onChange={(e) => e.target.value && r.setCustom(r.from!, e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

function ExportButton() {
  const r = useRange();
  const label = r.from && r.to ? `${r.from} → ${r.to}` : 'all records';
  return (
    <a
      className="btn primary"
      href={r.withRange('/api/dashboard/export.xlsx')}
      download
      title={`Download an Excel file for ${label}`}
      style={{ textDecoration: 'none' }}
    >
      Export Excel
    </a>
  );
}

function ThemeSelect() {
  const [theme, setTheme] = useThemePref();
  return (
    <label className="row small">
      Theme
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        {THEMES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** While the tab is visible, tell the server once a minute (it measures time spent). */
function useHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') void api.post('/heartbeat').catch(() => undefined);
    };
    const id = window.setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);
}

export function Layout() {
  const me = useMe();
  useHeartbeat();
  const { logout } = useSession();
  const { search } = useRange();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">Journal</div>
        {NAV.filter((n) => !('ownerOnly' in n) || me.isOwner).map((n) => (
          <NavLink key={n.to} to={{ pathname: n.to, search }} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <span>
            {me.isOwner ? (
              <>
                <strong>Your dashboard</strong> · you can edit the calendar
              </>
            ) : (
              <>
                Viewing <strong>{me.ownerName}</strong> · read-only
              </>
            )}
          </span>
          <span>{me.viewerEmail}</span>
          <ThemeSelect />
          <button className="btn" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </nav>
      <main className="main">
        <div className="topbar">
          <DateFilter />
          <div className="row">
            <span className="small muted" title={`Times shown in ${me.timezone}`}>
              Today: {formatLongDate(me.today)} · {me.timezone}
            </span>
            <ExportButton />
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
