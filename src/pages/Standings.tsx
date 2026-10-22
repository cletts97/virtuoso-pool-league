import { Trophy } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { standings, participantName } from '../domain/rules';
import { Avatar, PageHeading, Section } from '../components/ui';
import { StandingsTable } from '../components/StandingsTable';
import { QualificationNotice } from '../components/QualificationNotice';
import { Link } from 'react-router-dom';

export function Standings() {
  const { state, season } = useLeague();
  const rows = standings(season, state.fixtures);
  return (
    <>
      <PageHeading
        eyebrow="STANDINGS"
        title="League table"
        description={`${season.name} · Rankings based on confirmed results.`}
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
                  ? 'FIRST PLACE'
                  : row.position === 2
                    ? 'SECOND PLACE'
                    : 'THIRD PLACE'}
              </span>
              <h2>{participantName(state, row.participantId)}</h2>
              <p>
                {row.won} wins <span>·</span> {row.difference > 0 ? '+' : ''}
                {row.difference} frames
              </p>
            </div>
            <strong>
              {row.won}
              <small>WINS</small>
            </strong>
          </Link>
        ))}
      </div>
      <QualificationNotice />
      <Section
        title="League standings"
        subtitle={`${season.participantIds.length} players · Ranked by match wins`}
      >
        <StandingsTable />
        <div className="table-legend">
          <span>
            <span className="qualification-dot" />
            {season.qualifiers.length
              ? 'Confirmed playoff qualifiers · Seeds locked'
              : 'Top four · Provisional playoff positions'}
          </span>
          <span>
            P: played · W: won · L: lost · F: frames won · A: frames against · Win %: win rate
          </span>
        </div>
      </Section>
      <div className="rules-callout">
        <Trophy size={23} />
        <div>
          <h3>Playoff qualification</h3>
          <p>
            Ranked by match wins, frame difference, then frames won. For exactly two players still
            tied, their confirmed regular-season head-to-head result decides the order. Otherwise
            immutable participant ID determines display order only. Unresolved ties across the
            fourth-place cutoff require an administrator-approved decider. Once qualification is
            resolved, seeds lock after the regular season is confirmed or explicitly finalized by an
            administrator. Historical corrections update standings but preserve finalized playoff
            seeds; highlights identify those locked qualifiers.
          </p>
        </div>
      </div>
    </>
  );
}
