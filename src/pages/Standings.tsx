import { Trophy } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { standings, participantName } from '../domain/rules';
import { Avatar, PageHeading, Section } from '../components/ui';
import { StandingsTable } from '../components/StandingsTable';
import { Link } from 'react-router-dom';

export function Standings() {
  const { state, season } = useLeague();
  const rows = standings(season, state.fixtures);
  return (
    <>
      <PageHeading
        eyebrow="THE COMPETITION"
        title="Every frame counts."
        description={`${season.name} · The standings, as they stand. Only confirmed results count.`}
      />
      <div className="podium-grid">
        {rows.slice(0, 3).map((row) => (
          <Link
            to={`/players/${row.participantId}`}
            className={`podium-card place-${row.position}`}
            key={row.participantId}
          >
            <span className="podium-place">0{row.position}</span>
            <Avatar id={row.participantId} large />
            <div>
              <span className="eyebrow">
                {row.position === 1
                  ? 'SETTING THE PACE'
                  : row.position === 2
                    ? 'IN THE CHASE'
                    : 'ON THE PODIUM'}
              </span>
              <h2>{participantName(state, row.participantId)}</h2>
              <p>
                {row.won} wins <span>·</span> {row.difference > 0 ? '+' : ''}
                {row.difference} frames
              </p>
            </div>
            <strong>
              {row.points}
              <small>PTS</small>
            </strong>
          </Link>
        ))}
      </div>
      <Section
        title="League standings"
        subtitle={`${season.participantIds.length} players · ${season.config.pointsPerWin} points for a win`}
      >
        <StandingsTable />
        <div className="table-legend">
          <span>
            <span className="qualification-dot" />
            Top four · Playoff positions
          </span>
          <span>W / L · Recent form, oldest to newest</span>
        </div>
      </Section>
      <div className="rules-callout">
        <Trophy size={23} />
        <div>
          <h3>The road to the title</h3>
          <p>
            Ranked by points, frame difference, then frames won. An immutable participant ID breaks
            an exact tie. The top four are locked when every regular-season match is confirmed, or
            an administrator explicitly finalizes the season. Historical corrections update
            standings but preserve the finalized playoff seeds.
          </p>
        </div>
      </div>
    </>
  );
}
