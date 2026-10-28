import { ArrowRight, CalendarDays, CheckCheck, Clock3, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { dateOnly, weekStart, weekLabel } from '../domain/rules';
import { SeasonAdditionPreview } from './SeasonAdditionPreview';
import { canAddSeasonPlayer, canJoinSeasonDirectly } from '../domain/seasonManagement';
import type { SeasonJoinRequest } from '../domain/types';
import { Modal, Section } from './ui';
import { RebalancedEnrollmentModal } from './RebalancedEnrollmentModal';

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
    <section className="league-join mb-6" aria-label="Join a league">
      {seasons.map((season) => {
        const request = state.joinRequests?.find(
          (r) => r.seasonId === season.id && r.playerId === state.currentUserId,
        );
        const upcoming = canJoinSeasonDirectly(season, today);
        const waiting = !upcoming && request?.status === 'pending';
        const label = upcoming
          ? 'Join league'
          : request
            ? request.status === 'pending'
              ? 'Request pending'
              : request.status === 'rejected'
                ? 'Request declined'
                : 'Request accepted'
            : 'Request to join';
        return (
          <div className={`league-join-card ${waiting ? 'is-pending' : ''}`} key={season.id}>
            <div className="league-join-icon" aria-hidden="true">
              <Trophy size={27} />
            </div>
            <div className="league-join-copy">
              <span className="league-join-status">
                {upcoming ? 'Upcoming league' : 'League in progress'}
              </span>
              <h3>{season.name}</h3>
              <div className="league-join-meta">
                <span>
                  <CalendarDays size={15} aria-hidden="true" />
                  {upcoming ? 'Starts' : 'Started'}{' '}
                  {weekLabel(season.startDate).replace('Week', 'week')}
                </span>
                <span>
                  <Users size={15} aria-hidden="true" />
                  {season.participantIds.length}{' '}
                  {season.participantIds.length === 1 ? 'player' : 'players'} joined
                </span>
              </div>
            </div>
            <div className="league-join-action">
              <button
                className="button primary league-join-cta"
                disabled={busy || (!upcoming && !!request)}
                onClick={() =>
                  void run(
                    { type: upcoming ? 'joinSeason' : 'requestSeasonJoin', seasonId: season.id },
                    upcoming
                      ? 'You have joined the league.'
                      : 'Your request has been sent to the administrators.',
                  )
                }
              >
                {busy ? 'Working…' : label}
                {waiting ? (
                  <Clock3 size={18} aria-hidden="true" />
                ) : !upcoming && request ? (
                  <CheckCheck size={18} aria-hidden="true" />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </button>
              <small>
                {upcoming
                  ? 'Join instantly · No approval needed'
                  : waiting
                    ? 'Your request is awaiting review'
                    : request?.status === 'rejected'
                      ? 'Contact an administrator to discuss joining'
                      : 'Administrator approval required'}
              </small>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function AdminJoinRequests() {
  const { state, run, busy } = useLeague();
  const [selected, setSelected] = useState<SeasonJoinRequest>();
  const [dueDate, setDueDate] = useState(weekStart(dateOnly()));
  const [rebalanceSeason, setRebalanceSeason] = useState<string>();
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
        subtitle="Review requests individually, or accept joiners together and preview revised future weeks."
      >
        <div className="admin-actions rebalance-actions">
          {[...new Set(requests.map((r) => r.seasonId))].map((id) => {
            const season = state.seasons.find((s) => s.id === id);
            return season?.status === 'regular' && canAddSeasonPlayer(state, season) ? (
              <button
                key={id}
                className="button primary small"
                onClick={() => setRebalanceSeason(id)}
              >
                Preview joiners & future weeks · {season.name}
              </button>
            ) : null;
          })}
        </div>
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
                    setDueDate([weekStart(dateOnly()), weekStart(s!.startDate)].sort().at(-1)!);
                  }}
                >
                  Review request
                </button>
              </div>
            );
          })}
        </div>
      </Section>
      {rebalanceSeason && (
        <RebalancedEnrollmentModal
          seasonId={rebalanceSeason}
          onClose={() => setRebalanceSeason(undefined)}
        />
      )}
      {selected && season && (
        <Modal title="Review league join request" onClose={close}>
          <div className="form-stack">
            <p>
              <strong>{player?.name}</strong> requested to join <strong>{season.name}</strong>.
            </p>
            {season.status !== 'draft' && (
              <label>
                First fixture week (Monday)
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
                : `Adds one best-of-three fixture against each of the ${season.participantIds.length} existing players.`}
            </p>
            <SeasonAdditionPreview season={season} firstWeek={dueDate} />
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
