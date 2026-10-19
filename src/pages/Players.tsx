import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Search, Target, TrendingUp, Trophy } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { participantName, playedDate, standings, winner } from '../domain/rules';
import { Avatar, Empty, FormDots, PageHeading, Section, Stat } from '../components/ui';
import { MatchCard } from '../components/MatchCard';

export function Players() {
  const { state, season } = useLeague();
  const [query, setQuery] = useState('');
  const rows = standings(season, state.fixtures);
  const entries = state.participants.filter(
    (p) =>
      season.participantIds.includes(p.id) && p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="MEET THE COMPETITION"
        title="Good people. Great rivals."
        description={`${season.participantIds.length} colleagues bringing their best game to the table.`}
      />
      <div className="filter-bar">
        <Search size={18} />
        <label className="search-label">
          <span className="sr-only">Search players</span>
          <input
            placeholder="Find a player…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="filter-count">{entries.length} players</span>
      </div>
      <div className="player-grid">
        {entries.map((p) => {
          const row = rows.find((r) => r.participantId === p.id)!;
          const player = state.players.find((u) => p.playerIds.includes(u.id));
          return (
            <Link key={p.id} to={`/players/${p.id}`} className="player-card">
              <div className="player-card-top">
                <span className="player-rank">#{row.position} IN THE LEAGUE</span>
                <ArrowUpRight size={18} />
              </div>
              <Avatar id={p.id} large />
              <h2>{p.name}</h2>
              <p>
                {player?.department}
                {player && !player.active ? ' · Inactive' : ''}
              </p>
              <div className="player-card-stats">
                <div>
                  <strong>{row.points}</strong>
                  <span>POINTS</span>
                </div>
                <div>
                  <strong>{row.won}</strong>
                  <span>WINS</span>
                </div>
                <div>
                  <strong>{row.winPercentage}%</strong>
                  <span>WIN RATE</span>
                </div>
              </div>
              <div className="player-form">
                <span>Recent form</span>
                <FormDots form={row.form} />
              </div>
            </Link>
          );
        })}
      </div>
      {!entries.length && (
        <Empty title="No players found">Try searching by first or last name.</Empty>
      )}
    </>
  );
}
export function PlayerProfile() {
  const { id } = useParams();
  const { state, season } = useLeague();
  const [opponentId, setOpponentId] = useState('');
  const participant = state.participants.find((p) => p.id === id);
  if (!participant)
    return (
      <Empty title="Player not found">
        <Link to="/players">View all players</Link>
      </Empty>
    );
  const player = state.players.find((p) => participant.playerIds.includes(p.id));
  const row = standings(season, state.fixtures).find((r) => r.participantId === participant.id);
  const fixtures = state.fixtures.filter(
    (f) => f.seasonId === season.id && [f.homeId, f.awayId].includes(participant.id),
  );
  const history = fixtures
    .filter((f) => f.status === 'confirmed')
    .sort((a, b) => playedDate(b).localeCompare(playedDate(a)));
  const upcoming = fixtures
    .filter((f) => ['scheduled', 'postponed', 'pending', 'disputed'].includes(f.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const opponents = state.participants.filter(
    (p) => p.id !== id && season.participantIds.includes(p.id),
  );
  const opponent = opponentId || opponents[0]?.id;
  const h2h = state.fixtures.filter(
    (f) =>
      f.status === 'confirmed' &&
      [f.homeId, f.awayId].includes(participant.id) &&
      [f.homeId, f.awayId].includes(opponent),
  );
  const wins = h2h.filter((f) => winner(f) === participant.id).length;
  return (
    <>
      <Link className="back-link" to="/players">
        <ArrowLeft size={15} />
        All players
      </Link>
      <div className="profile-hero">
        <Avatar id={participant.id} large />
        <div>
          <span className="eyebrow">{player?.department}</span>
          <h1>{participant.name}</h1>
          <p>{row ? `#${row.position} in ${season.name}` : `Not entered in ${season.name}`}</p>
          <FormDots form={row?.form ?? []} />
        </div>
        <div className="profile-badge">
          <Trophy size={28} />
          <span>{row && row.position <= 4 ? 'PLAYOFF POSITION' : 'THE CHASE IS ON'}</span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Matches won"
          value={row?.won ?? 0}
          detail={`${row?.played ?? 0} regular-season matches played`}
          icon={<Trophy size={18} />}
        />
        <Stat
          label="Matches lost"
          value={row?.lost ?? 0}
          detail="A chance to come back stronger"
          icon={<Target size={18} />}
        />
        <Stat
          label="Frame difference"
          value={`${row && row.difference > 0 ? '+' : ''}${row?.difference ?? 0}`}
          detail={`${row?.framesWon ?? 0} won · ${row?.framesLost ?? 0} lost`}
          icon={<TrendingUp size={18} />}
        />
        <Stat
          label="Win percentage"
          value={`${row?.winPercentage ?? 0}%`}
          detail={`${row?.points ?? 0} league points earned`}
          icon={<Target size={18} />}
        />
      </div>
      <div className="dashboard-columns">
        <div className="stack">
          <Section
            title="Season performance"
            subtitle="Regular-season wins and losses, round by round."
          >
            <div
              className="performance-chart"
              role="img"
              aria-label={`${row?.won ?? 0} wins and ${row?.lost ?? 0} losses`}
            >
              {fixtures
                .filter((f) => f.stage === 'regular')
                .map((f) => (
                  <div key={f.id} className="performance-round">
                    <Link
                      to={`/fixtures/${f.id}`}
                      title={`Round ${f.round}: ${f.status}`}
                      className={`performance-bar ${f.status === 'confirmed' ? (winner(f) === id ? 'win' : 'loss') : ''}`}
                    >
                      {f.status === 'confirmed' ? (winner(f) === id ? 'W' : 'L') : '·'}
                    </Link>
                    <span>{f.round}</span>
                  </div>
                ))}
            </div>
            <div className="panel-footnote">Round number · Confirmed results only</div>
          </Section>
          <Section title="Match history" subtitle="Regular season and playoff results.">
            <div className="match-grid two">
              {history.map((f) => (
                <MatchCard key={f.id} fixture={f} compact />
              ))}
            </div>
            {!history.length && <Empty title="No confirmed results yet" />}
          </Section>
        </div>
        <div className="stack">
          <Section title="Head to head" subtitle="All recorded seasons, including playoffs.">
            <label className="field-inline">
              Opponent
              <select value={opponent ?? ''} onChange={(e) => setOpponentId(e.target.value)}>
                {opponents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="h2h">
              <div>
                <Avatar id={participant.id} />
                <strong>{wins}</strong>
                <span>{participant.name.split(' ')[0]}</span>
              </div>
              <span>WINS</span>
              <div>
                <Avatar id={opponent ?? ''} />
                <strong>{h2h.length - wins}</strong>
                <span>{participantName(state, opponent).split(' ')[0]}</span>
              </div>
            </div>
            <p className="panel-footnote">{h2h.length} confirmed meetings</p>
          </Section>
          <Section title="Still to play">
            <div className="stack compact-stack">
              {upcoming.slice(0, 4).map((f) => (
                <MatchCard key={f.id} fixture={f} compact />
              ))}
              {!upcoming.length && <Empty title="All caught up" />}
            </div>
            {upcoming.length > 4 && (
              <Link className="text-link panel-footnote" to={`/fixtures?player=${id}`}>
                View all {upcoming.length} outstanding fixtures
                <ArrowUpRight size={14} />
              </Link>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
