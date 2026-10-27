import { ArrowRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../app/LeagueContext';
import { matchStatus, participantName, playedDate, weekLabel } from '../domain/rules';
import type { Fixture } from '../domain/types';
import { Avatar, Badge } from './ui';

export function MatchCard({ fixture, compact = false }: { fixture: Fixture; compact?: boolean }) {
  const { state } = useLeague();
  return (
    <Link
      to={`/fixtures/${fixture.id}`}
      className={`match-card ${compact ? 'compact' : ''}`}
      aria-label={`${participantName(state, fixture.homeId)} versus ${participantName(state, fixture.awayId)}, ${matchStatus(fixture)}`}
    >
      <div className="match-meta">
        <span>
          {fixture.stage === 'regular'
            ? `Round ${String(fixture.round).padStart(2, '0')}`
            : fixture.stage === 'final'
              ? 'Final'
              : 'Semifinal'}
        </span>
        <Badge status={matchStatus(fixture)} />
      </div>
      <div className="match-contest">
        <div className="match-player">
          <Avatar id={fixture.homeId} />
          <strong>{participantName(state, fixture.homeId)}</strong>
        </div>
        <div className={`score ${fixture.score ? 'has-score' : ''}`}>
          {fixture.score ? `${fixture.score.home} : ${fixture.score.away}` : 'vs'}
        </div>
        <div className="match-player away">
          <Avatar id={fixture.awayId} />
          <strong>{participantName(state, fixture.awayId)}</strong>
        </div>
      </div>
      <div className="match-footer">
        <span>
          <CalendarDays size={13} />
          {fixture.status === 'confirmed'
            ? 'Played ' +
              new Date(playedDate(fixture)).toLocaleDateString('en-GB', {
                timeZone: 'Europe/London',
                day: 'numeric',
                month: 'short',
              })
            : weekLabel(fixture.dueDate)}{' '}
          <span className="meta-divider">·</span>{' '}
          {fixture.stage === 'regular' &&
          fixture.score &&
          Math.max(fixture.score.home, fixture.score.away) === 1
            ? 'Single frame'
            : `Best of ${fixture.bestOf}`}
        </span>
        <ArrowRight size={16} />
      </div>
    </Link>
  );
}
