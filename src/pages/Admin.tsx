import { useState } from 'react';
import { liveMode } from '../auth/client';
import { AccountManagement, ReminderAction } from '../components/AccountManagement';
import { Link } from 'react-router-dom';
import { ChevronRight, Edit3, Megaphone, Plus, ShieldCheck, WandSparkles } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { matchStatus } from '../domain/rules';
import { Avatar, Badge, Confirm, Empty, PageHeading, Section, Stat } from '../components/ui';
import { AnnouncementForm, FinalizeForm, PlayerForm, SeasonForm } from '../components/AdminForms';
import { MatchCard } from '../components/MatchCard';
import type { Player } from '../domain/types';
import { QualificationNotice } from '../components/QualificationNotice';
import { AddSeasonPlayerForm } from '../components/AddSeasonPlayerForm';

export function Admin() {
  const { state, season, run, preferences, busy } = useLeague();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState<
    'player' | 'season' | 'settings' | 'finalize' | 'announcement' | 'generate' | 'latePlayer'
  >();
  const [editing, setEditing] = useState<Player>();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  if (user.role !== 'admin')
    return (
      <Empty title="Administrator access required">
        {liveMode
          ? 'Your account does not have permission to manage the league.'
          : 'Switch to Alex Morgan (Admin) in the development demo switcher to manage the league.'}
      </Empty>
    );
  const fixtures = state.fixtures.filter((f) => f.seasonId === season.id);
  const disputes = fixtures.filter((f) => f.status === 'disputed'),
    postponed = fixtures.filter((f) => f.status === 'postponed'),
    overdue = fixtures.filter((f) => matchStatus(f) === 'overdue');
  const close = () => {
    setModal(undefined);
    setEditing(undefined);
  };
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="League administration"
        description="Manage seasons, players, fixtures and league settings."
        action={
          <button className="button primary" onClick={() => setModal('season')}>
            <Plus size={17} />
            Create season
          </button>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Active players"
          value={state.players.filter((p) => p.active && p.role !== 'colleague').length}
          detail="Across the club"
        />
        <Stat label="Disputed results" value={disputes.length} detail="Waiting for your review" />
        <Stat label="Overdue matches" value={overdue.length} detail="No automatic penalties" />
        <Stat
          label="Postponed fixtures"
          value={postponed.length}
          detail="Waiting to be rescheduled"
        />
      </div>
      <div className="tabs" role="tablist" aria-label="Administration sections">
        {[
          ['overview', 'Season & configuration'],
          ['players', 'Players'],
          ['fixtures', 'Fixtures & disputes'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            id={`tab-${value}`}
            aria-controls={`panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(e) => {
              const order = ['overview', 'players', 'fixtures'];
              const index = order.indexOf(value);
              const next =
                e.key === 'ArrowRight'
                  ? order[(index + 1) % order.length]
                  : e.key === 'ArrowLeft'
                    ? order[(index + order.length - 1) % order.length]
                    : e.key === 'Home'
                      ? order[0]
                      : e.key === 'End'
                        ? order.at(-1)
                        : undefined;
              if (next) {
                e.preventDefault();
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <QualificationNotice />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <div className="dashboard-columns">
            <div className="stack">
              <Section title="Current season" subtitle="The competition selected in the header.">
                {!season.id ? (
                  <Empty title="Create the first season">
                    Invite colleagues, add at least four to the league, then create a season.
                  </Empty>
                ) : (
                  <>
                    <div className="admin-season">
                      <Badge status={season.status} />
                      <h2>{season.name}</h2>
                      <p>
                        {season.participantIds.length} players · Starts{' '}
                        {new Date(`${season.startDate}T12:00:00`).toLocaleDateString('en-GB')} ·{' '}
                        {fixtures.filter((f) => f.stage === 'regular').length} league fixtures
                      </p>
                      <div className="admin-actions">
                        <button className="button secondary" onClick={() => setModal('settings')}>
                          <Edit3 size={15} />
                          Season settings
                        </button>
                        {season.status === 'draft' && (
                          <button className="button primary" onClick={() => setModal('generate')}>
                            <WandSparkles size={15} />
                            Generate fixtures
                          </button>
                        )}
                        {season.status === 'regular' && (
                          <button
                            className="button secondary"
                            onClick={() => setModal('latePlayer')}
                          >
                            <Plus size={15} /> Add player to season
                          </button>
                        )}
                        {season.status === 'regular' && (
                          <button className="button secondary" onClick={() => setModal('finalize')}>
                            <ShieldCheck size={15} />
                            Finalize regular season
                          </button>
                        )}
                        {['playoffs', 'complete'].includes(season.status) && (
                          <Link className="button primary" to="/playoffs">
                            View playoff bracket
                            <ChevronRight size={16} />
                          </Link>
                        )}
                      </div>
                      <dl className="config-list">
                        <div>
                          <dt>Competition</dt>
                          <dd>Singles · Round-robin</dd>
                        </div>
                        <div>
                          <dt>Scheduling target</dt>
                          <dd>{season.config.roundsPerWeek} rounds / week</dd>
                        </div>
                        <div>
                          <dt>Ranking</dt>
                          <dd>Match wins · Frame-based tiebreakers</dd>
                        </div>
                        <div>
                          <dt>Match formats</dt>
                          <dd>League BO3 · Semifinal BO5 · Final BO7</dd>
                        </div>
                        <div>
                          <dt>Playoff qualification</dt>
                          <dd>
                            Top four ·{' '}
                            {season.qualifiers.length ? 'Seeds locked' : 'Not yet finalized'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </>
                )}
              </Section>
              <Section title="Season archive">
                <div className="admin-list">
                  {state.seasons.map((s) => (
                    <button
                      key={s.id}
                      className="season-row"
                      onClick={() => void preferences({ selectedSeasonId: s.id })}
                    >
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.participantIds.length} players · {s.startDate}
                        </small>
                      </div>
                      <Badge status={s.status} />
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </Section>
            </div>
            <div className="stack">
              <Section title="League communications">
                <div className="admin-season">
                  <Megaphone className="accent" size={28} />
                  <h3>League announcements</h3>
                  <p>Post a notice to the dashboard and everyone’s in-app inbox for this season.</p>
                  <button
                    disabled={!season.id}
                    className="button secondary"
                    onClick={() => setModal('announcement')}
                  >
                    Post announcement
                    <Plus size={16} />
                  </button>
                  {liveMode && <ReminderAction />}
                </div>
              </Section>
              <div className="notice-card">
                <div className="eyebrow">COMPETITION FORMATS</div>
                <h3>Singles league</h3>
                <p>This league uses singles matches. Doubles competitions are not available yet.</p>
              </div>
            </div>
          </div>
        )}
        {tab === 'players' && (
          <Section
            title="Player management"
            subtitle="Changes preserve existing season entries and results."
          >
            <div className="admin-toolbar">
              {liveMode ? (
                <AccountManagement />
              ) : (
                <>
                  <button
                    className="button primary"
                    onClick={() => {
                      setEditing(undefined);
                      setModal('player');
                    }}
                  >
                    <Plus size={16} />
                    Add player
                  </button>
                </>
              )}
            </div>
            <div className="admin-list">
              {state.players.map((p) => (
                <div className="managed-player" key={p.id}>
                  <Avatar id={p.id} />
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.department} ·{' '}
                      {p.role === 'admin'
                        ? 'Administrator'
                        : p.role === 'colleague'
                          ? 'Casual colleague'
                          : 'Player'}
                    </small>
                  </div>
                  <span className={`badge ${p.active ? 'badge-confirmed' : 'badge-cancelled'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      setEditing(p);
                      setModal('player');
                    }}
                    aria-label={`Edit ${p.name}`}
                  >
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
        {tab === 'fixtures' && (
          <div className="stack">
            <Section
              title="Disputed results"
              subtitle="Review the match timeline, then resolve with a recorded reason."
            >
              <div className="match-grid">
                {disputes.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
              {!disputes.length && <Empty title="No disputed results" />}
            </Section>
            <Section
              title="Overdue fixtures"
              subtitle="Contact the players and agree a new date. No automatic loss is applied."
            >
              <div className="match-grid">
                {overdue.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
              {!overdue.length && <Empty title="No overdue fixtures" />}
            </Section>
            <Section
              title="Postponed fixtures"
              subtitle="Use Adjust fixture in the match centre to restore a scheduled match."
            >
              <div className="match-grid">
                {postponed.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
              {!postponed.length && <Empty title="No postponements" />}
            </Section>
            <Link to="/fixtures" className="button secondary">
              Browse all fixtures & correct results
              <ChevronRight size={16} />
            </Link>
          </div>
        )}
      </div>
      {modal === 'player' && <PlayerForm player={editing} onClose={close} />}{' '}
      {modal === 'season' && <SeasonForm onClose={close} />}{' '}
      {modal === 'settings' && <SeasonForm edit onClose={close} />}{' '}
      {modal === 'latePlayer' && <AddSeasonPlayerForm onClose={close} />}{' '}
      {modal === 'finalize' && <FinalizeForm onClose={close} />}{' '}
      {modal === 'announcement' && <AnnouncementForm onClose={close} />}{' '}
      {modal === 'generate' && (
        <Confirm
          title="Publish the season’s fixtures?"
          label="Generate fixtures"
          onClose={close}
          onConfirm={() => {
            if (!busy)
              void run(
                { type: 'generate', seasonId: season.id },
                'Round-robin fixtures generated and published.',
              ).then((ok) => {
                if (ok) close();
              });
          }}
        >
          Generate {(season.participantIds.length * (season.participantIds.length - 1)) / 2} unique
          matches across{' '}
          {season.participantIds.length % 2
            ? season.participantIds.length
            : season.participantIds.length - 1}{' '}
          rounds, targeting {season.config.roundsPerWeek} rounds per week. The season’s schedule
          settings will then be locked.
        </Confirm>
      )}
    </>
  );
}
