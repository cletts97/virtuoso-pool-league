import { Link } from 'react-router-dom';
import { Crown, LockKeyhole, Trophy, ArrowRight } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { participantName, standings } from '../domain/rules';
import type { Fixture } from '../domain/types';
import { Avatar, Badge, PageHeading } from '../components/ui';

function BracketMatch({
  fixture,
  seeds,
  label,
  bestOf,
}: {
  fixture?: Fixture;
  seeds?: string[];
  label: string;
  bestOf: number;
}) {
  const { state } = useLeague();
  const players = fixture ? [fixture.homeId, fixture.awayId] : seeds;
  const body = (
    <>
      <div className="bracket-match-header">
        <span>{label}</span>
        {fixture ? (
          <Badge status={fixture.status} />
        ) : (
          <span className="provisional">{players ? 'Projected' : 'To be decided'}</span>
        )}
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`bracket-player ${fixture?.score && ((i === 0 && fixture.score.home > fixture.score.away) || (i === 1 && fixture.score.away > fixture.score.home)) && fixture.status === 'confirmed' ? 'bracket-winner' : ''}`}
        >
          {players?.[i] ? (
            <Avatar id={players[i]} />
          ) : (
            <span className="avatar placeholder">?</span>
          )}
          <strong>
            {players?.[i] ? participantName(state, players[i]) : `Winner of semifinal ${i + 1}`}
          </strong>
          <span className="bracket-score">
            {fixture?.score ? (i === 0 ? fixture.score.home : fixture.score.away) : '–'}
          </span>
        </div>
      ))}
      <div className="bracket-match-footer">
        Best of {bestOf} frames {fixture && <ArrowRight size={14} />}
      </div>
    </>
  );
  return fixture ? (
    <Link className="bracket-match" to={`/fixtures/${fixture.id}`}>
      {body}
    </Link>
  ) : (
    <div className="bracket-match provisional-match">{body}</div>
  );
}
export function Playoffs() {
  const { state, season } = useLeague();
  const projected = standings(season, state.fixtures)
    .slice(0, 4)
    .map((r) => r.participantId);
  const qualifiers = season.qualifiers.length ? season.qualifiers : projected;
  const semis = state.fixtures.filter((f) => f.seasonId === season.id && f.stage === 'semifinal');
  const final = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'final');
  const locked = season.qualifiers.length > 0;
  const confirmed = state.fixtures.filter(
    (f) => f.seasonId === season.id && f.stage === 'regular' && f.status === 'confirmed',
  ).length;
  const count = state.fixtures.filter(
    (f) => f.seasonId === season.id && f.stage === 'regular',
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="THE ROAD TO GLORY"
        title="Four contenders. One champion."
        description="The league gets you here. Your next game takes you further."
        action={
          <span className="badge badge-playoffs">
            <Trophy size={16} />
            Top 4 playoffs
          </span>
        }
      />
      {!locked && (
        <div className="action-banner neutral">
          <LockKeyhole size={22} />
          <div>
            <strong>The bracket is taking shape</strong>
            <span>
              Projected from today’s standings. Seeds lock after all {count || 'regular-season'}{' '}
              matches are confirmed ({confirmed} so far), or when an administrator finalizes the
              season.
            </span>
          </div>
        </div>
      )}
      {season.finalizedReason && (
        <p className="info-banner">
          Regular season explicitly finalized: {season.finalizedReason}. Unresolved fixtures were
          closed without points.
        </p>
      )}
      <div className="bracket-panel">
        <div className="bracket-heading">
          <span className="eyebrow">{season.name}</span>
          <h2>THE CHAMPIONSHIP</h2>
          <span className="bracket-rule" />
        </div>
        <div className="bracket">
          <div className="bracket-stage">
            <div className="stage-title">
              <span>01</span>
              <h3>Semifinals</h3>
              <small>FIRST TO 3</small>
            </div>
            <div className="semifinals">
              <BracketMatch
                fixture={semis[0]}
                seeds={qualifiers.length >= 4 ? [qualifiers[0], qualifiers[3]] : undefined}
                label="1st seed vs 4th seed"
                bestOf={5}
              />
              <BracketMatch
                fixture={semis[1]}
                seeds={qualifiers.length >= 4 ? [qualifiers[1], qualifiers[2]] : undefined}
                label="2nd seed vs 3rd seed"
                bestOf={5}
              />
            </div>
          </div>
          <div className="bracket-stage final-stage">
            <div className="stage-title">
              <span>02</span>
              <h3>Grand final</h3>
              <small>FIRST TO 4</small>
            </div>
            <div className="final-slot">
              <BracketMatch fixture={final} label="The title match" bestOf={7} />
            </div>
          </div>
          <div className="bracket-stage champion-stage">
            <div className="stage-title">
              <span>03</span>
              <h3>The champion</h3>
              <small>ONE OF A KIND</small>
            </div>
            <div className={`champion-card ${season.championId ? 'crowned' : ''}`}>
              <div className="trophy-halo">
                <Crown size={54} strokeWidth={1.3} />
              </div>
              <span className="eyebrow">
                {season.championId ? 'YOUR LEAGUE CHAMPION' : 'THE CROWN AWAITS'}
              </span>
              {season.championId ? (
                <>
                  <Avatar id={season.championId} large />
                  <Link to={`/players/${season.championId}`}>
                    <h2>{participantName(state, season.championId)}</h2>
                  </Link>
                  <p>{season.name}</p>
                </>
              ) : (
                <>
                  <h2>
                    Who will own
                    <br />
                    the table?
                  </h2>
                  <p>One final. Everything to play for.</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="bracket-footer">
          <span className="qualification-dot" />
          {locked
            ? 'Finalized seeds · Click a match to view or submit a result'
            : 'Provisional bracket · Positions may change until qualification is finalized'}
        </div>
      </div>
      <div className="playoff-info">
        <div>
          <strong>01 / EARN YOUR PLACE</strong>
          <p>Finish in the top four of the regular season.</p>
        </div>
        <div>
          <strong>02 / WIN YOUR SEMIFINAL</strong>
          <p>First plays fourth. Second plays third. Best of five.</p>
        </div>
        <div>
          <strong>03 / TAKE THE TITLE</strong>
          <p>The semifinal winners meet in a best-of-seven final.</p>
        </div>
      </div>
    </>
  );
}
