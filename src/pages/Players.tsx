import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Search, Target, TrendingUp, Trophy } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { playedDate, winner } from '../domain/rules';
import { Avatar, Empty, FormDots, PageHeading, Section, Stat } from '../components/ui';
import { playerLeagueFixtures, playerLeagueStats } from '../domain/playerStats';
import { MatchCard } from '../components/MatchCard';

export function Players() {
  const { state } = useLeague();
  const [query, setQuery] = useState('');
  const entries = state.players
    .filter((p) => p.active && p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeading
        eyebrow="PLAYER DIRECTORY"
        title="Players"
        description="All active users · Confirmed league and playoff records across all seasons."
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
          const row = playerLeagueStats(state, p.id);
          const player = p;
          return (
            <Link key={p.id} to={`/players/${p.id}`} className="player-card">
              <div className="player-card-top">
                <span className="player-rank">ALL SEASONS</span>
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
                  <strong>{row.played}</strong>
                  <span>PLAYED</span>
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
  const { state } = useLeague();
  const [opponentId, setOpponentId] = useState('');
  const entry = state.participants.find((p) => p.id === id && p.kind === 'individual');
  const player = state.players.find((p) => p.id === id || p.id === entry?.playerIds[0]);
  const participant = player
    ? { id: entry?.id ?? player.id, name: player.name, playerIds: [player.id] }
    : undefined;
  if (!participant)
    return (
      <Empty title="Player not found">
        <Link to="/players">View all players</Link>
      </Empty>
    );
  const row = playerLeagueStats(state, player!.id);
  const fixtures = playerLeagueFixtures(state, player!.id);
  const entryIds = new Set(
    state.participants
      .filter((p) => p.kind === 'individual' && p.playerIds[0] === player!.id)
      .map((p) => p.id),
  );
  const history = fixtures
    .filter((f) => f.status === 'confirmed')
    .sort((a, b) => playedDate(b).localeCompare(playedDate(a)));
  const upcoming = fixtures
    .filter((f) => ['scheduled', 'postponed', 'pending', 'disputed'].includes(f.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const opponents = state.players.filter((p) => p.id !== player!.id && p.active);
  const opponent = opponentId || opponents[0]?.id;
  const opponentEntries = new Set(
    state.participants
      .filter((p) => p.kind === 'individual' && p.playerIds[0] === opponent)
      .map((p) => p.id),
  );
  const h2h = fixtures.filter(
    (f) =>
      f.status === 'confirmed' &&
      winner(f) &&
      [f.homeId, f.awayId].some((id) => opponentEntries.has(id)),
  );
  const wins = h2h.filter((f) => entryIds.has(winner(f)!)).length;
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
          <p>Confirmed league and playoff results · All seasons</p>
          <FormDots form={row?.form ?? []} />
        </div>
        <div className="profile-badge">
          <Trophy size={28} />
          <span>ALL SEASONS</span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Matches won"
          value={row?.won ?? 0}
          detail={`${row?.played ?? 0} league and playoff matches played`}
          icon={<Trophy size={18} />}
        />
        <Stat
          label="Matches lost"
          value={row?.lost ?? 0}
          detail="Across all seasons"
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
          detail={`${row?.won ?? 0} wins from ${row?.played ?? 0} matches`}
          icon={<Target size={18} />}
        />
      </div>
      <div className="dashboard-columns">
        <div className="stack">
          <Section
            title="League history"
            subtitle="Confirmed league and playoff results across all seasons."
          >
            <div
              className="performance-chart"
              role="img"
              aria-label={`${row?.won ?? 0} wins and ${row?.lost ?? 0} losses`}
            >
              {fixtures
                .filter((f) => f.status === 'confirmed')
                .map((f) => (
                  <div key={f.id} className="performance-round">
                    <Link
                      to={`/fixtures/${f.id}`}
                      title={`${state.seasons.find((s) => s.id === f.seasonId)?.name} · Round ${f.round}: ${f.status}`}
                      className={`performance-bar ${f.status === 'confirmed' ? (entryIds.has(winner(f)!) ? 'win' : 'loss') : ''}`}
                    >
                      {f.status === 'confirmed' ? (entryIds.has(winner(f)!) ? 'W' : 'L') : '·'}
                    </Link>
                    <span>{f.round}</span>
                  </div>
                ))}
            </div>
            <div className="panel-footnote">
              Round number · All seasons · Confirmed results only
            </div>
          </Section>
          <Section
            title="Match history"
            subtitle="All seasons · Regular season and playoff results."
          >
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
                <span>
                  {opponents.find((p) => p.id === opponent)?.name.split(' ')[0] ?? 'No opponent'}
                </span>
              </div>
            </div>
            <p className="panel-footnote">{h2h.length} confirmed meetings</p>
            <Link className="text-link panel-footnote" to={`/casual?player=${player?.id ?? ''}`}>
              View casual head-to-head records <ArrowUpRight size={14} />
            </Link>
          </Section>
          <Section title="Still to play">
            <div className="stack compact-stack">
              {upcoming.slice(0, 4).map((f) => (
                <MatchCard key={f.id} fixture={f} compact />
              ))}
              {!upcoming.length && <Empty title="No upcoming fixtures" />}
            </div>
            {upcoming.length > 4 && (
              <Link className="text-link panel-footnote" to="/fixtures">
                Browse fixtures by season
                <ArrowUpRight size={14} />
              </Link>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
