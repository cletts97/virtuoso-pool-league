import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { isParticipant, matchStatus, participantName, weekLabel, weekStart } from '../domain/rules';
import { Badge, Empty, PageHeading } from '../components/ui';
import { MatchCard } from '../components/MatchCard';

export function Fixtures() {
  const { state, season } = useLeague();
  const [params, setParams] = useSearchParams();
  const canSeeMine =
    !state.readOnly &&
    state.players.some((p) => p.id === state.currentUserId && p.active) &&
    state.participants.some(
      (p) => season.participantIds.includes(p.id) && p.playerIds.includes(state.currentUserId),
    );
  const mine =
    canSeeMine &&
    (params.get('scope') === 'mine' || (!params.has('scope') && !params.has('player')));
  const status = params.get('status') ?? 'all',
    player = params.get('player') ?? 'all',
    week = params.get('week') ?? 'all';
  const update = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === 'all') next.delete(key);
      else next.set(key, value);
      return next;
    });
  const all = state.fixtures.filter((f) => f.seasonId === season.id);
  const matches = all.filter(
    (f) =>
      (status === 'all' || matchStatus(f) === status) &&
      (!mine || isParticipant(f, state.currentUserId, state.participants)) &&
      (player === 'all' || [f.homeId, f.awayId].includes(player)) &&
      (week === 'all' || weekStart(f.dueDate) === week),
  );
  const weeks = [...new Set(all.map((f) => weekStart(f.dueDate)))].sort();
  return (
    <>
      <PageHeading
        eyebrow="SCHEDULE"
        title="Fixtures & results"
        description="Fixtures are assigned to a Monday–Sunday week. Arrange a time with your opponent or play early."
        action={<Badge status={season.status} />}
      />
      {canSeeMine && (
        <div className="fixture-scope" role="group" aria-label="Fixture view">
          {[
            ['mine', 'My fixtures'],
            ['all', 'All fixtures'],
          ].map(([scope, label]) => (
            <button
              key={scope}
              className={`button ${mine === (scope === 'mine') ? 'primary' : 'secondary'}`}
              aria-pressed={mine === (scope === 'mine')}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('scope', scope);
                  next.delete('player');
                  return next;
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="filter-bar">
        <span className="filter-icon">
          <SlidersHorizontal size={18} /> Filter matches
        </span>
        <label>
          <span className="sr-only">Player filter</span>
          <select
            aria-label="Player filter"
            value={player}
            onChange={(e) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('scope', 'all');
                if (e.target.value === 'all') next.delete('player');
                else next.set('player', e.target.value);
                return next;
              })
            }
          >
            <option value="all">All players</option>
            {season.participantIds.map((id) => (
              <option key={id} value={id}>
                {participantName(state, id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Week filter</span>
          <select
            aria-label="Week filter"
            value={week}
            onChange={(e) => update('week', e.target.value)}
          >
            <option value="all">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status filter</span>
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => update('status', e.target.value)}
          >
            {[
              ['all', 'All statuses'],
              ['scheduled', 'Upcoming'],
              ['confirmed', 'Confirmed'],
              ['pending', 'Awaiting approval'],
              ['postponed', 'Postponed'],
              ['overdue', 'Overdue'],
              ['disputed', 'Disputed'],
              ['cancelled', 'Closed'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {(params.has('player') || params.has('status') || params.has('week')) && (
          <button className="text-link" onClick={() => setParams({ scope: mine ? 'mine' : 'all' })}>
            Clear filters
          </button>
        )}
        <span className="filter-count">{matches.length} matches</span>
      </div>
      {!matches.length && (
        <div className="panel">
          <Empty title="No matches found">
            {all.length
              ? 'Try a different filter to find your fixture.'
              : 'This season is waiting for its fixtures. An administrator can generate the schedule.'}
          </Empty>
        </div>
      )}
      {weeks
        .filter((w) => matches.some((f) => weekStart(f.dueDate) === w))
        .map((w) => {
          const weekMatches = matches
            .filter((f) => weekStart(f.dueDate) === w)
            .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
          return (
            <section className="fixture-round" key={w}>
              <div className="round-heading">
                <h2>{weekLabel(w)}</h2>
                <span>
                  {weekMatches.length} {weekMatches.length === 1 ? 'match' : 'matches'}
                </span>
              </div>
              <div className="match-grid">
                {weekMatches.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
            </section>
          );
        })}
    </>
  );
}
