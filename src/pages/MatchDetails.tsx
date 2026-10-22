import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock3, ShieldCheck } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import {
  addDays,
  canApprove,
  dateOnly,
  isParticipant,
  matchStatus,
  participantName,
  scoreOptions,
} from '../domain/rules';
import { Avatar, Badge, Empty, Modal, PageHeading, Section } from '../components/ui';
import type { Score } from '../domain/types';
import { bookingDayLabel, bookingEnd, londonDate, londonTime } from '../domain/bookings';
import { useClock } from '../app/useClock';
import { liveMode } from '../auth/client';

export function MatchDetails() {
  const { id } = useParams();
  const { state, run, busy, preferences } = useLeague();
  const now = useClock();
  const fixture = state.fixtures.find((f) => f.id === id);
  const [action, setAction] = useState<
    'submit' | 'correct' | 'dispute' | 'postpone' | 'reschedule' | 'approve'
  >();
  const [score, setScore] = useState<Score>();
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState(addDays(dateOnly(), 7));
  if (!fixture)
    return (
      <Empty title="Match not found">
        <Link to="/fixtures">Return to fixtures</Link>
      </Empty>
    );
  const match = fixture;
  const season = state.seasons.find((s) => s.id === match.seasonId)!;
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const admin = user.role === 'admin';
  const participant = isParticipant(match, user.id, state.participants);
  const review = canApprove(match, user.id, state.participants);
  const closed =
    season.status === 'complete' || (match.stage === 'regular' && season.status === 'playoffs');
  const open = ['scheduled', 'postponed'].includes(match.status) && !closed;
  const reservation = state.bookings.find(
    (b) =>
      b.fixtureId === match.id &&
      b.status === 'reserved' &&
      Date.parse(bookingEnd(b)) > now.getTime(),
  );
  const launch = (next: typeof action) => {
    setScore(match.score);
    setReason('');
    setDueDate(match.dueDate > dateOnly() ? match.dueDate : addDays(dateOnly(), 7));
    setAction(next);
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    let ok = false;
    if (action === 'submit' && score)
      ok = await run(
        { type: 'submit', fixtureId: match.id, score },
        'Result submitted. Your opponent can now confirm it.',
      );
    if (action === 'correct' && score)
      ok = await run(
        { type: 'correct', fixtureId: match.id, score, reason },
        'Result updated. The full audit history is preserved.',
      );
    if (action === 'approve' || action === 'dispute')
      ok = await run(
        { type: 'review', fixtureId: match.id, approve: action === 'approve', reason },
        action === 'approve'
          ? 'Result confirmed. The league has been updated.'
          : 'Dispute recorded for administrator review.',
      );
    if (action === 'postpone' || action === 'reschedule')
      ok = await run(
        { type: action, fixtureId: match.id, dueDate, reason },
        'Fixture date updated. Players have been notified.',
      );
    if (ok) setAction(undefined);
  }
  const titles = {
    submit: 'Submit match result',
    correct: 'Resolve or correct result',
    dispute: 'Dispute this result',
    postpone: 'Postpone fixture',
    reschedule: 'Adjust fixture',
    approve: 'Confirm this result?',
  };
  return (
    <>
      <Link
        to="/fixtures"
        className="back-link"
        onClick={() => {
          if (state.selectedSeasonId !== match.seasonId)
            void preferences({ selectedSeasonId: match.seasonId });
        }}
      >
        <ArrowLeft size={15} />
        Back to fixtures
      </Link>
      <PageHeading
        eyebrow={season.name.toUpperCase()}
        title={
          match.stage === 'regular'
            ? `Round ${match.round} · Match centre`
            : match.stage === 'final'
              ? 'The grand final'
              : 'The semifinals'
        }
        description={`Best of ${match.bestOf} frames · First to ${Math.ceil(match.bestOf / 2)} wins · Due ${new Date(`${match.dueDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        action={<Badge status={matchStatus(match)} />}
      />
      <section className="match-centre panel">
        <div className="match-centre-players">
          <Link to={`/players/${match.homeId}`}>
            <Avatar id={match.homeId} large />
            <h2>{participantName(state, match.homeId)}</h2>
            <span>HOME</span>
          </Link>
          <div className="big-score">
            {match.score ? (
              <>
                {match.score.home}
                <span>:</span>
                {match.score.away}
              </>
            ) : (
              <span>VS</span>
            )}
          </div>
          <Link to={`/players/${match.awayId}`}>
            <Avatar id={match.awayId} large />
            <h2>{participantName(state, match.awayId)}</h2>
            <span>AWAY</span>
          </Link>
        </div>
        <div className="match-centre-actions">
          {(participant || admin) && open && (
            <Link
              className="button secondary"
              to={reservation ? '/bookings' : `/bookings?fixture=${encodeURIComponent(match.id)}`}
            >
              <Clock3 size={17} />
              {reservation ? 'View table reservation' : 'Book the table'}
            </Link>
          )}
          {participant && open && (
            <button className="button primary" onClick={() => launch('submit')}>
              Submit result
              <Check size={17} />
            </button>
          )}
          {review && (
            <>
              <button className="button primary" onClick={() => launch('approve')}>
                <Check size={17} />
                Approve result
              </button>
              <button className="button secondary" onClick={() => launch('dispute')}>
                Dispute score
              </button>
            </>
          )}
          {(participant || admin) && open && (
            <button className="button secondary" onClick={() => launch('postpone')}>
              <Clock3 size={17} />
              Postpone match
            </button>
          )}
          {admin && open && (
            <button className="button secondary" onClick={() => launch('reschedule')}>
              Adjust fixture
            </button>
          )}
          {admin && ['pending', 'disputed', 'confirmed'].includes(match.status) && (
            <button className="button secondary" onClick={() => launch('correct')}>
              <ShieldCheck size={17} />
              {match.status === 'disputed' ? 'Resolve dispute' : 'Correct result'}
            </button>
          )}
        </div>
        {reservation && (
          <p className="match-message">
            Table reserved · {bookingDayLabel(londonDate(reservation.startAt))} ·{' '}
            {londonTime(reservation.startAt)}–{londonTime(bookingEnd(reservation))} Europe/London.
            Manage this separately from the fixture due date.
          </p>
        )}
        {match.status === 'pending' && !state.readOnly && (
          <p className="match-message">
            Submitted by {state.players.find((p) => p.id === match.submittedBy)?.name}. Only the
            opposing player can confirm it.{' '}
            {!liveMode &&
              match.submittedBy === user.id &&
              'Switch demo users to review as your opponent.'}
          </p>
        )}
        {match.status === 'disputed' && (
          <p className="match-message">
            This result is disputed and does not count toward standings. An administrator must
            resolve it.
          </p>
        )}
        {match.note && <p className="match-message">{match.note}</p>}
        {match.status === 'cancelled' && (
          <p className="match-message">
            Closed when the regular season was finalized. No win, loss, or automatic defeat was
            awarded.
          </p>
        )}
        {!participant && !admin && open && (
          <p className="match-message">
            {liveMode
              ? 'Only the players in this match can submit a result.'
              : 'Players arrange their own matches. Sign in as a participant using the demo switcher to submit a result.'}
          </p>
        )}
      </section>
      <div className="dashboard-columns">
        <Section title="Match timeline" subtitle="An accountable record of every change.">
          {match.history.length ? (
            <ol className="timeline">
              {[...match.history].reverse().map((h) => (
                <li key={h.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                      {h.score && ` · ${h.score.home}–${h.score.away}`}
                    </strong>
                    <p>
                      {state.players.find((p) => p.id === h.actorId)?.name} ·{' '}
                      {new Date(h.at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                    {h.reason && <blockquote>{h.reason}</blockquote>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="A match waiting for its story">
              Play early if you like. Submit the score when you’re done.
            </Empty>
          )}
        </Section>
        <Section title="How it works">
          <ol className="workflow-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Play your match</strong>
                <p>First to {Math.ceil(match.bestOf / 2)} frames. Arrange a time together.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>One player submits</strong>
                <p>Select the final score, in home–away order.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>The opponent confirms</strong>
                <p>Only confirmed results become official.</p>
              </div>
            </li>
          </ol>
        </Section>
      </div>
      {action && (
        <Modal title={titles[action]} onClose={() => setAction(undefined)}>
          <form onSubmit={submit} className="form-stack">
            {(action === 'submit' || action === 'correct') && (
              <fieldset>
                <legend>
                  Final score · {participantName(state, match.homeId)} vs{' '}
                  {participantName(state, match.awayId)}
                </legend>
                <div className="score-options">
                  {scoreOptions(match.bestOf).map((option) => (
                    <label
                      key={`${option.home}-${option.away}`}
                      className={
                        score?.home === option.home && score.away === option.away ? 'selected' : ''
                      }
                    >
                      <input
                        type="radio"
                        name="score"
                        required
                        checked={score?.home === option.home && score.away === option.away}
                        onChange={() => setScore(option)}
                      />
                      {option.home} <span>:</span> {option.away}
                    </label>
                  ))}
                </div>
                <p className="field-help">
                  Choose the completed score. Home player is on the left.
                </p>
              </fieldset>
            )}
            {action === 'approve' && (
              <p className="muted">
                Confirm {participantName(state, match.homeId)} {match.score?.home}–
                {match.score?.away} {participantName(state, match.awayId)}? This makes the result
                official.
              </p>
            )}
            {(action === 'postpone' || action === 'reschedule') && (
              <label>
                New due date
                <input
                  required
                  type="date"
                  value={dueDate}
                  min={season.startDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
            )}
            {['correct', 'dispute', 'postpone', 'reschedule'].includes(action) && (
              <label>
                Reason
                <textarea
                  required
                  maxLength={300}
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Give a short explanation for the match record."
                />
              </label>
            )}
            {action === 'correct' && season.qualifiers.length > 0 && match.stage === 'regular' && (
              <p className="field-help">
                Playoff seeds are already locked. This correction updates historical standings but
                does not reseed the bracket.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setAction(undefined)}
              >
                Cancel
              </button>
              <button disabled={busy} className="button primary" type="submit">
                {action === 'approve' ? 'Confirm result' : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
