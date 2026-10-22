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
import { TodayBookings } from '../components/TodayBookings';
import { RuleReminders } from '../components/RuleReminders';

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
        eyebrow="OVERVIEW"
        title={
          state.readOnly
            ? 'Welcome to Virtuoso Pool League.'
            : `Welcome, ${user.name.split(' ')[0]}.`
        }
        description={
          season.status === 'complete'
            ? 'View the final standings, results and playoff matches.'
            : 'View league standings, fixtures, results and table bookings.'
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
                Season complete.
                <br />
                <em>Final results.</em>
              </>
            ) : (
              <>
                Pool league.
                <br />
                <em>Season overview.</em>
              </>
            )}
          </h2>
          <p>
            {season.status === 'complete' && season.championId
              ? `${participantName(state, season.championId)} won the season. View the final results.`
              : `${season.participantIds.length} players. View the schedule, results and playoff places.`}
          </p>
          <Link
            className="button primary"
            to={season.status === 'complete' ? '/playoffs' : '/standings'}
          >
            {season.status === 'complete' ? 'View season winner' : 'View standings'}
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
      <TodayBookings />
      <RuleReminders />
      <div className="stats-grid">
        <Stat
          label="In the competition"
          value={season.participantIds.length}
          detail="Players in this season."
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
          label={state.readOnly ? 'Season progress' : 'Your position'}
          value={state.readOnly ? `${progress}%` : own?.played ? `#${own.position}` : '—'}
          detail={
            state.readOnly
              ? 'Browse the competition · Sign in to participate'
              : own?.played
                ? `${own.won} wins · ${own.lost} losses`
                : ownEntry
                  ? 'No matches played yet'
                  : 'Casual bookings are open to you'
          }
          icon={<Flag size={18} />}
        />
        <Stat
          label="League leader"
          value={leader ? participantName(state, leader.participantId).split(' ')[0] : '—'}
          detail={
            leader
              ? `${leader.won} wins · ${leader.difference > 0 ? '+' : ''}${leader.difference} frame difference`
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
            <span>Review your opponent’s score to confirm the result.</span>
          </div>
          <ArrowRight size={20} />
        </Link>
      )}
      <div className="dashboard-columns">
        <div className="stack">
          <Section
            title="League table"
            subtitle="Standings based on confirmed results."
            link={{ to: '/standings', label: 'Full table' }}
          >
            <StandingsTable preview />
            <div className="panel-footnote">
              <span className="qualification-dot" />
              {season.qualifiers.length
                ? 'Confirmed playoff qualifiers highlighted'
                : 'Top four · Provisional playoff positions'}
            </div>
          </Section>
          <Section
            title="Recent results"
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
              {!recent.length && <Empty title="No confirmed results yet" />}
            </div>
          </Section>
        </div>
        <div className="stack">
          <Section title="Your next match" subtitle="Your next scheduled fixture.">
            {next ? (
              <MatchCard fixture={next} />
            ) : (
              <Empty title="No upcoming matches">Check the full schedule for your season.</Empty>
            )}
          </Section>
          <div className="notice-card">
            <div className="eyebrow">
              <Flame size={15} /> LEAGUE NOTICE
            </div>
            <h3>
              {state.announcements.find((a) => a.seasonId === season.id)?.title ??
                'League information'}
            </h3>
            <p>
              {state.announcements.find((a) => a.seasonId === season.id)?.body ??
                'Check your fixtures and confirm submitted results after each match.'}
            </p>
            <Link to="/notifications" className="text-link">
              Visit your inbox
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </div>
      <Section
        title="Upcoming fixtures"
        subtitle="Scheduled matches for this season."
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
