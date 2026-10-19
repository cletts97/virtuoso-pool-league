import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  Flag,
  Flame,
  Trophy,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../app/LeagueContext';
import { canApprove, isParticipant, participantName, playedDate, standings } from '../domain/rules';
import { Avatar, Badge, Empty, PageHeading, Section, Stat } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { StandingsTable } from '../components/StandingsTable';

export function Dashboard() {
  const { state, season } = useLeague();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const seasonFixtures = state.fixtures.filter((f) => f.seasonId === season.id);
  const fixtures = seasonFixtures.filter((f) => f.stage === 'regular');
  const table = standings(season, fixtures),
    leader = table[0];
  const confirmed = fixtures.filter((f) => f.status === 'confirmed');
  const recent = seasonFixtures
    .filter((f) => f.status === 'confirmed')
    .sort((a, b) => playedDate(b).localeCompare(playedDate(a)));
  const upcoming = seasonFixtures
    .filter((f) => ['scheduled', 'postponed'].includes(f.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = upcoming.find((f) => isParticipant(f, user.id, state.participants));
  const approvals = state.fixtures.filter(
    (f) => f.seasonId === season.id && canApprove(f, user.id, state.participants),
  );
  const ownEntry = state.participants.find((p) => p.playerIds.includes(user.id));
  const own = table.find((r) => r.participantId === ownEntry?.id);
  const progress = fixtures.length ? Math.round((confirmed.length / fixtures.length) * 100) : 0;
  return (
    <>
      <PageHeading
        eyebrow="THE CLUBHOUSE"
        title={`Good to see you, ${user.name.split(' ')[0]}.`}
        description={
          season.status === 'complete'
            ? 'A season to remember. Explore the results and the road to the title.'
            : 'The table is set. Let’s make every frame count.'
        }
        action={
          <Link className="button secondary" to="/fixtures">
            <CalendarDays size={16} />
            View fixtures
          </Link>
        }
      />
      <div className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            {season.format.toUpperCase()} COMPETITION <span> / </span>{' '}
            <Badge status={season.status} />
          </div>
          <h2>
            {season.status === 'complete' ? (
              <>
                A season.
                <br />
                <em>A champion.</em>
              </>
            ) : (
              <>
                Office colleagues.
                <br />
                <em>Table rivals.</em>
              </>
            )}
          </h2>
          <p>
            {season.status === 'complete' && season.championId
              ? `${participantName(state, season.championId)} takes the crown. Relive the season, frame by frame.`
              : `${season.participantIds.length} players. One league. Four playoff spots. Your next great game starts here.`}
          </p>
          <Link
            className="button primary"
            to={season.status === 'complete' ? '/playoffs' : '/standings'}
          >
            {season.status === 'complete' ? 'Meet the champion' : 'Explore the standings'}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="table-lines" />
          <div className="cue" />
          <div className="pool-ball ball-eight">
            <span>8</span>
          </div>
          <div className="pool-ball ball-orange">
            <span>5</span>
          </div>
          <div className="pool-ball ball-white" />
          <span className="hero-art-label">
            THE VIRTUOSO LEAGUE <span>EST. 2026</span>
          </span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="In the competition"
          value={season.participantIds.length}
          detail="Players. One shared ambition."
          icon={<Users size={18} />}
        />
        <Stat
          label="Matches played"
          value={
            <>
              {confirmed.length}
              <span> / {fixtures.length}</span>
            </>
          }
          detail={`${progress}% of the regular season complete`}
          icon={<CheckCheck size={18} />}
        />
        <Stat
          label="Your position"
          value={own?.played ? `#${own.position}` : '—'}
          detail={
            own?.played ? `${own.points} points · ${own.won} wins` : 'Your story starts with a game'
          }
          icon={<Flag size={18} />}
        />
        <Stat
          label="League leader"
          value={leader ? participantName(state, leader.participantId).split(' ')[0] : '—'}
          detail={
            leader
              ? `${leader.points} points · ${leader.difference > 0 ? '+' : ''}${leader.difference} frame difference`
              : 'No players yet'
          }
          icon={<Trophy size={18} />}
        />
      </div>
      {approvals.length > 0 && (
        <Link className="action-banner" to={`/fixtures/${approvals[0].id}`}>
          <CheckCheck size={22} />
          <div>
            <strong>
              {approvals.length} {approvals.length === 1 ? 'result needs' : 'results need'} your
              confirmation
            </strong>
            <span>Review your opponent’s score to make it official.</span>
          </div>
          <ArrowRight size={20} />
        </Link>
      )}
      <div className="dashboard-columns">
        <div className="stack">
          <Section
            title="The race to the playoffs"
            subtitle="Every frame makes a difference."
            link={{ to: '/standings', label: 'Full table' }}
          >
            <StandingsTable preview />
            <div className="panel-footnote">
              <span className="qualification-dot" />
              Top four qualify for the playoffs
            </div>
          </Section>
          <Section
            title="Around the tables"
            subtitle="The latest confirmed results."
            link={{ to: '/fixtures?status=confirmed', label: 'All results' }}
          >
            <div className="result-list">
              {recent.slice(0, 3).map((f) => (
                <Link key={f.id} to={`/fixtures/${f.id}`} className="result-row">
                  <div>
                    <Avatar id={f.homeId} />
                    <span>{participantName(state, f.homeId)}</span>
                  </div>
                  <strong>
                    {f.score?.home}
                    <span>:</span>
                    {f.score?.away}
                  </strong>
                  <div>
                    <span>{participantName(state, f.awayId)}</span>
                    <Avatar id={f.awayId} />
                  </div>
                </Link>
              ))}
              {!recent.length && <Empty title="The first result is still to come" />}
            </div>
          </Section>
        </div>
        <div className="stack">
          <Section title="Your next match" subtitle="Find your opponent. Find your form.">
            {next ? (
              <MatchCard fixture={next} />
            ) : (
              <Empty title="You’re all caught up">Check the full schedule for your season.</Empty>
            )}
          </Section>
          <div className="notice-card">
            <div className="eyebrow">
              <Flame size={15} /> LEAGUE NOTICE
            </div>
            <h3>
              {state.announcements.find((a) => a.seasonId === season.id)?.title ??
                'Make it a good game.'}
            </h3>
            <p>
              {state.announcements.find((a) => a.seasonId === season.id)?.body ??
                'Keep it friendly, confirm your results, and enjoy the competition.'}
            </p>
            <Link to="/notifications" className="text-link">
              Visit your inbox
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </div>
      <Section
        title="Next on the baize"
        subtitle="The next chapter of the competition."
        link={{ to: '/fixtures', label: 'Full schedule' }}
      >
        <div className="match-grid">
          {upcoming.slice(0, 3).map((f) => (
            <MatchCard key={f.id} fixture={f} compact />
          ))}
          {!upcoming.length && <Empty title="No upcoming fixtures" />}
        </div>
      </Section>
    </>
  );
}
