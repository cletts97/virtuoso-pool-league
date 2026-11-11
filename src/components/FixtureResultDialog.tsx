import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { canApprove, fixtureScoreOptions, participantName } from '../domain/rules';
import { canEnterLeagueResult } from '../domain/personalFixtures';
import type { Score } from '../domain/types';
import { Modal } from './ui';
import { ResultScorePicker } from './ResultScorePicker';

export type FixtureResultAction = 'submit' | 'approve' | 'dispute';

export function FixtureResultDialog({
  fixtureId,
  initialAction,
  onClose,
}: {
  fixtureId: string;
  initialAction: FixtureResultAction;
  onClose(): void;
}) {
  const { state, run, busy } = useLeague();
  const [action, setAction] = useState(initialAction);
  const [score, setScore] = useState<Score>();
  const [reason, setReason] = useState('');
  const fixture = state.fixtures.find((f) => f.id === fixtureId);
  const allowed =
    !!fixture &&
    (action === 'submit'
      ? canEnterLeagueResult(state, fixture)
      : !state.readOnly &&
        state.players.some((p) => p.id === state.currentUserId && p.active) &&
        canApprove(fixture, state.currentUserId, state.participants));
  const title =
    action === 'submit'
      ? 'Submit match result'
      : action === 'approve'
        ? 'Confirm this result?'
        : 'Dispute this result';
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!fixture || !allowed || busy || (action === 'submit' && !score)) return;
    const ok =
      action === 'submit'
        ? await run(
            { type: 'submit', fixtureId, score: score! },
            'Result submitted. Your opponent can now confirm it.',
          )
        : await run(
            { type: 'review', fixtureId, approve: action === 'approve', reason },
            action === 'approve'
              ? 'Result confirmed. The league has been updated.'
              : 'Dispute recorded for administrator review.',
          );
    if (ok) onClose();
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!allowed || !fixture ? (
        <div className="form-stack">
          <p role="alert">
            This action is no longer available. Close this window and check the latest match status.
          </p>
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form className="form-stack" onSubmit={(e) => void save(e)}>
          <p>
            <strong>
              {participantName(state, fixture.homeId)} v {participantName(state, fixture.awayId)}
            </strong>
          </p>
          {action === 'submit' ? (
            <ResultScorePicker
              homeName={participantName(state, fixture.homeId)}
              awayName={participantName(state, fixture.awayId)}
              ownSide={
                state.participants
                  .find((p) => p.id === fixture.homeId)!
                  .playerIds.includes(state.currentUserId)
                  ? 'home'
                  : 'away'
              }
              options={fixtureScoreOptions(fixture)}
              value={score}
              onChange={setScore}
            />
          ) : (
            <p className="result-score-summary">
              {participantName(state, fixture.homeId)} {fixture.score?.home}–{fixture.score?.away}{' '}
              {participantName(state, fixture.awayId)}.{' '}
              {action === 'approve'
                ? 'Confirm only if this score is correct.'
                : 'Explain what needs correcting for the administrator.'}
            </p>
          )}
          {action === 'dispute' && (
            <label>
              Reason
              <textarea
                required
                minLength={3}
                maxLength={300}
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            {action === 'approve' && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAction('dispute')}
              >
                Dispute score
              </button>
            )}
            <button
              type="submit"
              className="button primary"
              disabled={busy || (action === 'submit' && !score)}
            >
              {busy
                ? 'Saving…'
                : action === 'submit'
                  ? 'Submit result'
                  : action === 'approve'
                    ? 'Confirm result'
                    : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
