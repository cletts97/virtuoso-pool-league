import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCheck } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { useClock } from '../app/useClock';
import { personalFixtures } from '../domain/personalFixtures';
import { participantName, weekLabel } from '../domain/rules';
import { bookingDayLabel, bookingEnd, londonDate, londonTime } from '../domain/bookings';
import { Avatar, Badge } from './ui';
import { FixtureResultDialog, type FixtureResultAction } from './FixtureResultDialog';

export function PersonalFixtures() {
  const { state, season, busy } = useLeague();
  const now = useClock();
  const [action, setAction] = useState<{ id: string; type: FixtureResultAction }>();
  if (
    state.readOnly ||
    !state.players.some((p) => p.id === state.currentUserId && p.active) ||
    !state.participants.some(
      (p) => season.participantIds.includes(p.id) && p.playerIds.includes(state.currentUserId),
    )
  )
    return null;
  const rows = personalFixtures(state, season.id, now);
  const important = rows.filter((row) => row.priority < 5);
  const shown = important.length ? important.slice(0, 6) : rows.slice(0, 2);
  return (
    <section className="personal-fixtures" aria-labelledby="personal-fixtures-title">
      <header className="personal-fixtures-heading">
        <div>
          <span className="eyebrow">{season.name}</span>
          <h2 id="personal-fixtures-title">Your league matches</h2>
          <p>Your matches and results to review, with the most useful actions first.</p>
        </div>
        <Link className="button secondary" to="/fixtures?scope=mine">
          All my fixtures
        </Link>
      </header>
      {rows.length ? (
        <div className="personal-fixture-grid">
          {shown.map(({ fixture: f, booking, review, enter, finished, overdue, thisWeek }) => {
            const home = state.participants.find((p) => p.id === f.homeId)!;
            const opponent = home.playerIds.includes(state.currentUserId) ? f.awayId : f.homeId;
            return (
              <article
                className={`personal-fixture${review || finished ? ' needs-action' : ''}`}
                key={f.id}
              >
                <div className="personal-fixture-top">
                  <span className="eyebrow">
                    {review
                      ? 'Review needed'
                      : finished
                        ? 'Booking finished'
                        : overdue
                          ? 'Overdue'
                          : thisWeek
                            ? 'This week'
                            : 'Upcoming'}
                    {f.stage !== 'regular'
                      ? ` · ${f.stage === 'final' ? 'Final' : 'Semifinal'}`
                      : ''}
                  </span>
                  <Badge status={f.status} />
                </div>
                <Link className="personal-opponent" to={`/fixtures/${f.id}`}>
                  <Avatar id={opponent} />
                  <h3>
                    <span>You vs </span>
                    {participantName(state, opponent)}
                  </h3>
                </Link>
                <p className="personal-week">
                  <CalendarDays size={14} aria-hidden="true" />
                  {weekLabel(f.dueDate)}
                </p>
                {booking && (
                  <p className="personal-booking">
                    {finished ? 'Booking finished' : 'Table reserved'} ·{' '}
                    {bookingDayLabel(londonDate(booking.startAt))} · {londonTime(booking.startAt)}–
                    {londonTime(bookingEnd(booking))} (London)
                  </p>
                )}
                {f.score && (
                  <p className="personal-score">
                    {participantName(state, f.homeId)} {f.score.home}–{f.score.away}{' '}
                    {participantName(state, f.awayId)}
                  </p>
                )}
                {f.status === 'pending' && !review && (
                  <p className="personal-hint">Awaiting opponent confirmation</p>
                )}
                {f.status === 'disputed' && (
                  <p className="personal-hint">Administrator reviewing the dispute</p>
                )}
                <div className="personal-fixture-actions">
                  {review ? (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => setAction({ id: f.id, type: 'approve' })}
                    >
                      <CheckCheck size={16} />
                      Review result
                    </button>
                  ) : enter ? (
                    <>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => setAction({ id: f.id, type: 'submit' })}
                      >
                        Enter result
                      </button>
                      {!finished && (
                        <Link
                          className="button secondary"
                          to={
                            booking
                              ? `/bookings?date=${londonDate(booking.startAt)}`
                              : `/bookings?fixture=${encodeURIComponent(f.id)}`
                          }
                        >
                          {booking ? 'View booking' : 'Book table'}
                        </Link>
                      )}
                    </>
                  ) : (
                    <Link className="text-link" to={`/fixtures/${f.id}`}>
                      View match
                    </Link>
                  )}
                </div>
                {finished && (
                  <Link
                    className="text-link personal-rearrange"
                    to={`/fixtures/${f.id}?action=postpone`}
                  >
                    Not played? Rearrange
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="personal-empty">
          {season.status === 'draft'
            ? 'Your fixtures will appear here once the schedule is published.'
            : 'No outstanding matches. View all your fixtures for completed results.'}
        </p>
      )}
      {rows.length > shown.length && (
        <p className="personal-more">
          Showing {shown.length} of {rows.length} outstanding matches.{' '}
          <Link className="text-link" to="/fixtures?scope=mine">
            View the rest
          </Link>
        </p>
      )}
      {action && (
        <FixtureResultDialog
          key={`${action.id}/${action.type}`}
          fixtureId={action.id}
          initialAction={action.type}
          onClose={() => setAction(undefined)}
        />
      )}
    </section>
  );
}
