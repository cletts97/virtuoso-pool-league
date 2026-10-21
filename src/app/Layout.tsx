import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Trophy,
  CalendarDays,
  Users,
  GitBranch,
  ShieldCheck,
  Bell,
  Moon,
  Sun,
  ArrowUpRight,
  RotateCcw,
  ChevronDown,
  CalendarClock,
  BookOpen,
} from 'lucide-react';
import { useLeague } from './LeagueContext';
import { Avatar, Confirm } from '../components/ui';
import { ProfileSettings } from '../components/ProfileSettings';
import { liveMode, authClient } from '../auth/client';

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/standings', label: 'League table', icon: Trophy },
  { to: '/fixtures', label: 'Fixtures & results', icon: CalendarDays },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/playoffs', label: 'Playoffs', icon: GitBranch },
  { to: '/bookings', label: 'Table bookings', icon: CalendarClock },
  { to: '/rules', label: 'Rules', icon: BookOpen },
];
export function Layout() {
  const { state, season, preferences, reset } = useLeague();
  const [confirmReset, setConfirmReset] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const unread = state.notifications.filter(
    (n) => n.userId === user.id && n.seasonId === season.id && !n.read,
  ).length;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Virtuoso Pool League home">
          <img
            src={
              state.theme === 'dark' ? '/brand/virtuoso-white.png' : '/brand/virtuoso-gradient.png'
            }
            alt="Virtuoso"
          />
          <span>
            POOL LEAGUE
            <span className="brand-dot" />
          </span>
        </Link>
        <div className="nav-label">THE LEAGUE</div>
        <nav aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink end={to === '/'} key={to} to={to} aria-label={label} title={label}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/notifications" aria-label="Notifications" title="Notifications">
            <Bell size={19} />
            <span>Notifications</span>
            {unread > 0 && <span className="nav-count">{unread}</span>}
          </NavLink>
          {user.role === 'admin' && (
            <>
              <div className="nav-label admin-label">MANAGEMENT</div>
              <NavLink to="/admin" aria-label="Administration" title="Administration">
                <ShieldCheck size={19} />
                <span>Administration</span>
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="league-note">
            <div className="small-ball">8</div>
            <p>
              A little competition.
              <br />
              <strong>A lot of good company.</strong>
            </p>
          </div>
          <a
            href="https://virtuoso.tech/"
            target="_blank"
            rel="noreferrer"
            className="company-link"
          >
            Part of team Virtuoso
            <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="season-control">
            <span className="live-dot" />
            <label className="sr-only" htmlFor="season">
              Select season
            </label>
            <select
              id="season"
              disabled={!state.seasons.length}
              value={season.id}
              onChange={(e) => {
                void preferences({ selectedSeasonId: e.target.value });
                if (location.pathname.startsWith('/fixtures/')) navigate('/fixtures');
              }}
            >
              {!state.seasons.length && <option value="">No season yet</option>}
              {state.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === 'complete' ? ' · Archive' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => void preferences({ theme: state.theme === 'dark' ? 'light' : 'dark' })}
              aria-label={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {state.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link
              className="icon-button notification-bell"
              to="/notifications"
              aria-label={`Notifications, ${unread} unread`}
            >
              <Bell size={19} />
              {unread > 0 && <span />}
            </Link>
            <span className="topbar-divider" />
            {liveMode ? <ProfileSettings /> : <Avatar id={user.id} />}
            <span className="header-user">
              <strong>{user.name}</strong>
              <small>
                {user.role === 'admin'
                  ? 'League administrator'
                  : user.role === 'colleague'
                    ? 'Office colleague'
                    : 'League player'}
              </small>
            </span>
            {liveMode && (
              <button
                className="button secondary small"
                onClick={() => void authClient().auth.signOut()}
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        {!liveMode && (
          <div className="demo-bar">
            <span>
              <span className="demo-pill">DEMO</span>
              <span className="demo-explanation">
                Your league, in play. Changes are saved in this browser.
              </span>
            </span>
            <div>
              <label htmlFor="demo-user">Playing as</label>
              <select
                id="demo-user"
                value={user.id}
                onChange={(e) => void preferences({ currentUserId: e.target.value })}
              >
                {state.players
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.role === 'admin' ? ' (Admin)' : ''}
                      {p.role === 'colleague' ? ' (Casual)' : ''}
                    </option>
                  ))}
              </select>
              <button
                className="icon-button"
                title="Reset demo data"
                aria-label="Reset demo data"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        )}
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>Virtuoso Pool League</span>
          <span>Good games. Great colleagues.</span>
          <span>{liveMode ? 'Shared league workspace' : 'Demo workspace · Local data'}</span>
        </footer>
      </div>
      {!liveMode && confirmReset && (
        <Confirm
          title="Reset the demo league?"
          label="Reset demo"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            void reset();
            setConfirmReset(false);
          }}
        >
          All changes saved in this browser will be replaced with the original sample league. This
          cannot be undone.
        </Confirm>
      )}
    </div>
  );
}
