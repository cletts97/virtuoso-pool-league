import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  CheckCheck,
  MessageSquareWarning,
  Megaphone,
  Clock3,
} from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { Empty, PageHeading } from '../components/ui';

export function Notifications() {
  const { state, season, run, busy } = useLeague();
  const [filter, setFilter] = useState('all');
  if (state.readOnly)
    return (
      <Empty title="Notifications are private">
        <Link className="text-link" to="/login" state={{ from: '/notifications' }}>
          Sign in to view your notifications
        </Link>
      </Empty>
    );
  const all = state.notifications
    .filter(
      (n) => n.userId === state.currentUserId && (n.seasonId === season.id || n.casualResultId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = all.filter(
    (n) => filter === 'all' || (filter === 'unread' && !n.read) || filter === n.kind,
  );
  const icons = {
    upcoming: CalendarDays,
    approval: CheckCheck,
    approved: CheckCheck,
    disputed: MessageSquareWarning,
    postponement: Clock3,
    notice: Megaphone,
  };
  return (
    <>
      <PageHeading
        eyebrow="NOTIFICATIONS"
        title="Your notifications"
        description="League updates, casual result reviews and fixture reminders."
        action={
          <button
            className="button secondary"
            disabled={busy || !all.some((n) => !n.read)}
            onClick={() =>
              void run(
                { type: 'readNotifications', ids: all.map((n) => n.id) },
                'All notifications marked as read.',
              )
            }
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        }
      />
      <div className="filter-bar">
        <Bell size={18} />
        <label>
          Show
          <select
            aria-label="Notification filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread</option>
            <option value="approval">Approvals</option>
            <option value="approved">Confirmed results</option>
            <option value="disputed">Disputes</option>
            <option value="upcoming">Upcoming fixtures</option>
            <option value="postponement">Postponements</option>
            <option value="notice">League notices</option>
          </select>
        </label>
        <span className="filter-count">{all.filter((n) => !n.read).length} unread</span>
      </div>
      <div className="panel notification-list">
        {items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <article className={`notification-item ${item.read ? '' : 'unread'}`} key={item.id}>
              <div className={`notification-icon ${item.kind}`}>
                <Icon size={21} />
              </div>
              <div className="notification-copy">
                <div>
                  <h2>{item.title}</h2>
                  {!item.read && <span className="unread-dot" />}
                </div>
                <p>{item.body}</p>
                <small>
                  {new Date(item.createdAt).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </small>
                <div className="notification-actions">
                  {(item.fixtureId || item.casualResultId) && (
                    <Link
                      className="text-link"
                      to={
                        item.casualResultId
                          ? `/casual?result=${item.casualResultId}`
                          : `/fixtures/${item.fixtureId}`
                      }
                      onClick={() => {
                        if (!item.read)
                          void run(
                            { type: 'readNotifications', ids: [item.id] },
                            'Notification read.',
                          );
                      }}
                    >
                      {item.casualResultId ? 'Review casual result →' : 'View match →'}
                    </Link>
                  )}
                  {!item.read && (
                    <button
                      className="text-link muted"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          { type: 'readNotifications', ids: [item.id] },
                          'Notification read.',
                        )
                      }
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!items.length && (
          <Empty title="No new notifications">
            League updates and casual result review requests will appear here.
          </Empty>
        )}
      </div>
    </>
  );
}
