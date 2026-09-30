import { NavLink, Outlet } from 'react-router';
import { formatLongDate } from '@journal/shared';
import { PRESETS, useRange } from '../range';
import { useMe, useSession } from '../session';

const NAV = [
  { to: '/', label: 'Overview', icon: '◎', end: true },
  { to: '/habits', label: 'Habits', icon: '✓', end: false },
  { to: '/journal', label: 'Routine & Journal', icon: '✎', end: false },
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

export function Layout() {
  const me = useMe();
  const { logout } = useSession();
  const { search } = useRange();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">Journal</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={{ pathname: n.to, search }} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <span>
            Viewing <strong>{me.ownerName}</strong> · read-only
          </span>
          <span>{me.viewerEmail}</span>
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
