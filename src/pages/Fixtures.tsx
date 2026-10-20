import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { matchStatus, participantName } from '../domain/rules';
import { Badge, Empty, PageHeading } from '../components/ui';
import { MatchCard } from '../components/MatchCard';

export function Fixtures() {
  const { state, season } = useLeague();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all',
    player = params.get('player') ?? 'all',
    round = params.get('round') ?? 'all';
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
      (player === 'all' || [f.homeId, f.awayId].includes(player)) &&
      (round === 'all' || String(f.round) === round),
  );
  const rounds = [...new Set(all.map((f) => f.round))].sort((a, b) => a - b);
  return (
    <>
      <PageHeading
        eyebrow="ON THE TABLE"
        title="Fixtures & results"
        description="Find your next opponent, record a result, or relive a great game."
        action={<Badge status={season.status} />}
      />
      <div className="filter-bar">
        <span className="filter-icon">
          <SlidersHorizontal size={18} /> Filter matches
        </span>
        <label>
          <span className="sr-only">Player filter</span>
          <select
            aria-label="Player filter"
            value={player}
            onChange={(e) => update('player', e.target.value)}
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
          <span className="sr-only">Round filter</span>
          <select
            aria-label="Round filter"
            value={round}
            onChange={(e) => update('round', e.target.value)}
          >
            <option value="all">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                {all.find((f) => f.round === r)?.stage === 'regular'
                  ? `Round ${r}`
                  : all.find((f) => f.round === r)?.stage === 'final'
                    ? 'Grand final'
                    : 'Semifinals'}
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
        {params.size > 0 && (
          <button className="text-link" onClick={() => setParams({})}>
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
      {rounds
        .filter((r) => matches.some((f) => f.round === r))
        .map((r) => {
          const roundMatches = matches.filter((f) => f.round === r);
          const stage = roundMatches[0].stage;
          const playing = all.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
          const byes = season.participantIds.filter((id) => !playing.includes(id));
          return (
            <section className="fixture-round" key={r}>
              <div className="round-heading">
                <h2>
                  {stage === 'regular' ? (
                    <>
                      <span>{String(r).padStart(2, '0')}</span>Round {r}
                    </>
                  ) : stage === 'final' ? (
                    'Grand final'
                  ) : (
                    'Semifinals'
                  )}
                </h2>
                <span>
                  {roundMatches.length} {roundMatches.length === 1 ? 'match' : 'matches'}{' '}
                  <span className="meta-divider">·</span> Best of {roundMatches[0].bestOf}
                </span>
              </div>
              <div className="match-grid">
                {roundMatches.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
              {stage === 'regular' && byes.length > 0 && (
                <p className="bye-note">
                  <Search size={14} />
                  Bye this round: {byes.map((id) => participantName(state, id)).join(', ')}. No win
                  or loss awarded.
                </p>
              )}
            </section>
          );
        })}
    </>
  );
}
