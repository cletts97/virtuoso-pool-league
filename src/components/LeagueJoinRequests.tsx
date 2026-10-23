import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { addDays, dateOnly, weekStart, weekLabel } from '../domain/rules';
import { canAddSeasonPlayer } from '../domain/seasonManagement';
import type { SeasonJoinRequest } from '../domain/types';
import { Modal, Section } from './ui';

export function JoinLeagueCards() {
  const { state, run, busy } = useLeague();
  if (state.readOnly) return null;
  const seasons = state.seasons.filter(
    (s) =>
      canAddSeasonPlayer(state, s) &&
      s.participantIds.length < 40 &&
      !state.participants.some(
        (p) => s.participantIds.includes(p.id) && p.playerIds.includes(state.currentUserId),
      ),
  );
  if (!seasons.length) return null;
  const today = dateOnly();
  return (
    <Section
      className="mb-6"
      title="Join a league"
      subtitle="Request a place. An administrator will review your request before you are added."
    >
      <div className="match-grid">
        {seasons.map((s) => {
          const request = state.joinRequests?.find(
            (r) => r.seasonId === s.id && r.playerId === state.currentUserId,
          );
          const upcoming = s.status === 'draft' || weekStart(s.startDate) > weekStart(today);
          return (
            <div className="admin-season" key={s.id}>
              <span className="eyebrow">{upcoming ? 'Upcoming league' : 'League in progress'}</span>
              <h3>{s.name}</h3>
              <p>
                {upcoming ? 'Starts' : 'Started'} {weekLabel(s.startDate).replace('Week', 'week')} ·{' '}
                {s.participantIds.length} players
              </p>
              {!upcoming && (
                <p>
                  You can join after approval. Your existing opponents will get catch-up fixtures.
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || !!request}
                onClick={() =>
                  void run(
                    { type: 'requestSeasonJoin', seasonId: s.id },
                    'Your request has been sent to the administrators.',
                  )
                }
              >
                {request
                  ? request.status === 'pending'
                    ? 'Request pending'
                    : request.status === 'rejected'
                      ? 'Request declined'
                      : 'Request accepted'
                  : 'Request to join'}
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
export function AdminJoinRequests() {
  const { state, run, busy } = useLeague();
  const [selected, setSelected] = useState<SeasonJoinRequest>();
  const [dueDate, setDueDate] = useState(weekStart(addDays(dateOnly(), 14)));
  const requests = (state.joinRequests ?? []).filter((r) => r.status === 'pending');
  const season = state.seasons.find((s) => s.id === selected?.seasonId);
  const player = state.players.find((p) => p.id === selected?.playerId);
  const close = () => setSelected(undefined);
  if (!requests.length) return null;
  const review = async (approve: boolean) => {
    if (
      selected &&
      (await run(
        { type: 'reviewSeasonJoin', id: selected.id, approve, dueDate },
        approve ? 'Request accepted. Player added to the season.' : 'Request declined.',
      ))
    )
      close();
  };
  return (
    <>
      <Section
        className="mb-6"
        title="League join requests"
        subtitle="Requests from all seasons. Accepting an active-season request preserves existing fixtures and results."
      >
        <div className="admin-list">
          {requests.map((r) => {
            const s = state.seasons.find((s) => s.id === r.seasonId);
            const p = state.players.find((p) => p.id === r.playerId);
            return (
              <div className="managed-player" key={r.id}>
                <div>
                  <strong>{p?.name ?? 'Former account'}</strong>
                  <small>
                    {s?.name} · Requested {new Date(r.createdAt).toLocaleDateString('en-GB')}
                  </small>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => {
                    setSelected(r);
                    setDueDate(
                      [weekStart(addDays(dateOnly(), 14)), weekStart(s!.startDate)].sort().at(-1)!,
                    );
                  }}
                >
                  Review request
                </button>
              </div>
            );
          })}
        </div>
      </Section>
      {selected && season && (
        <Modal title="Review league join request" onClose={close}>
          <div className="form-stack">
            <p>
              <strong>{player?.name}</strong> requested to join <strong>{season.name}</strong>.
            </p>
            {season.status !== 'draft' && (
              <label>
                Catch-up week (Monday)
                <input
                  type="date"
                  required
                  min={[weekStart(dateOnly()), weekStart(season.startDate)].sort().at(-1)}
                  value={dueDate}
                  onChange={(e) => e.target.value && setDueDate(weekStart(e.target.value))}
                />
              </label>
            )}
            <p className="field-help">
              {season.status === 'draft'
                ? 'They will be included when fixtures are generated.'
                : `Adds one postponed best-of-three catch-up fixture against each of the ${season.participantIds.length} existing players.`}
            </p>
            {(!canAddSeasonPlayer(state, season) || !player?.active) && (
              <p>This season is closed or the account is inactive. You can decline this request.</p>
            )}
            <div className="form-actions">
              <button className="button secondary" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button className="button danger" disabled={busy} onClick={() => void review(false)}>
                Decline request
              </button>
              <button
                className="button primary"
                disabled={busy || !player?.active || !canAddSeasonPlayer(state, season)}
                onClick={() => void review(true)}
              >
                Accept request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
