import { AdminJoinRequests } from '../components/LeagueJoinRequests';
import { useState } from 'react';
import { liveMode } from '../auth/client';
import { AccountManagement, ReminderAction } from '../components/AccountManagement';
import { Link } from 'react-router-dom';
import { ChevronRight, Edit3, Megaphone, Plus, ShieldCheck, WandSparkles } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { matchStatus, weekLabel } from '../domain/rules';
import { Avatar, Badge, Confirm, Empty, PageHeading, Section, Stat } from '../components/ui';
import { AnnouncementForm, FinalizeForm, PlayerForm, SeasonForm } from '../components/AdminForms';
import { MatchCard } from '../components/MatchCard';
import type { Player } from '../domain/types';
import { QualificationNotice } from '../components/QualificationNotice';
import { AddSeasonPlayerForm } from '../components/AddSeasonPlayerForm';
import { CasualResultForm } from '../components/CasualResultForm';
import '../casual.css';
import { canAddSeasonPlayer, seasonDeletionBlock } from '../domain/seasonManagement';
import { SeasonLifecycleForm } from '../components/SeasonLifecycleForm';
import { ResultEmailStatus } from '../components/ResultEmailStatus';

export function Admin() {
  const { state, season, run, preferences, busy } = useLeague();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState<
    | 'deleteUser'
    | 'player'
    | 'season'
    | 'settings'
    | 'finalize'
    | 'announcement'
    | 'generate'
    | 'latePlayer'
    | 'end'
    | 'delete'
  >();
  const [editing, setEditing] = useState<Player>();
  const [casualResultId, setCasualResultId] = useState<string>();
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
  // Casual games have no season: always include all unresolved casual disputes.
  const casualDisputes = (state.casualResults ?? []).filter((r) => r.status === 'disputed');
  const resolvingCasual = casualDisputes.find((r) => r.id === casualResultId);
  const casualTeamName = (ids: string[]) =>
    ids.map((id) => state.players.find((p) => p.id === id)?.name ?? 'Former account').join(' & ');
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
        <Stat
          label="Disputed results"
          value={disputes.length + casualDisputes.length}
          detail="Selected season and all casual games"
        />
        <Stat label="Overdue matches" value={overdue.length} detail="No automatic penalties" />
        <Stat
          label="Postponed fixtures"
          value={postponed.length}
          detail="Waiting to be rescheduled"
        />
      </div>
      <AdminJoinRequests />
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
      {tab === 'overview' && liveMode && <ResultEmailStatus />}
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
                        {season.participantIds.length} players · {weekLabel(season.startDate)} ·{' '}
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
                        {
                          <button
                            className="button secondary"
                            disabled={!canAddSeasonPlayer(state, season)}
                            onClick={() => setModal('latePlayer')}
                          >
                            <Plus size={15} /> Add player to season
                          </button>
                        }
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
                        {season.status !== 'complete' && (
                          <button className="button secondary" onClick={() => setModal('end')}>
                            End season
                          </button>
                        )}
                        <button
                          className="button danger"
                          disabled={!!seasonDeletionBlock(state, season)}
                          onClick={() => setModal('delete')}
                        >
                          Delete season
                        </button>
                      </div>
                      {!canAddSeasonPlayer(state, season) && (
                        <p className="field-help">
                          Players can be added to singles drafts or an unfinalized regular season.
                          Additions are closed once playoffs are finalized or the season ends.
                        </p>
                      )}
                      {season.status === 'draft' && (
                        <p className="field-help">
                          This season is a draft. Add players here, then generate fixtures to begin
                          the regular season, even before its start week.
                        </p>
                      )}
                      {seasonDeletionBlock(state, season) && (
                        <p className="field-help">{seasonDeletionBlock(state, season)}</p>
                      )}
                      {season.finalizedReason && (
                        <p className="field-help">{season.finalizedReason}</p>
                      )}
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
                          {s.participantIds.length} players · {weekLabel(s.startDate)}
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
              {state.players
                .filter((p) => !p.deleted)
                .map((p) => (
                  <div className="managed-player" key={p.id}>
                    <Avatar id={p.id} />
                    <div>
                      <strong>{p.name}</strong>
                      <small>
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
                    <button
                      className="button danger small"
                      disabled={p.id === user.id}
                      title={p.id === user.id ? 'You cannot delete your own account' : undefined}
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setModal('deleteUser');
                      }}
                    >
                      Delete
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
              subtitle="League matches for the selected season and casual games from all dates. Resolve with a recorded reason."
            >
              <div className="match-grid">
                {disputes.map((f) => (
                  <MatchCard key={f.id} fixture={f} />
                ))}
              </div>
              {!!casualDisputes.length && (
                <div className="casual-history">
                  {casualDisputes.map((r) => (
                    <article className="casual-game" key={r.id}>
                      <header>
                        <span>
                          Casual {r.homePlayerIds.length === 2 ? 'doubles' : 'singles'} ·{' '}
                          {r.playedOn}
                        </span>
                        <Badge status={r.status} />
                      </header>
                      <div className="casual-score">
                        <div>
                          <strong>{casualTeamName(r.homePlayerIds)}</strong>
                        </div>
                        <b>
                          {r.score.home} – {r.score.away}
                        </b>
                        <div>
                          <strong>{casualTeamName(r.awayPlayerIds)}</strong>
                        </div>
                      </div>
                      <p className="field-help">
                        Dispute:{' '}
                        {[...r.history].reverse().find((h) => h.action === 'disputed')?.reason ??
                          'Review the game history for details.'}
                      </p>
                      <div className="casual-actions">
                        <button
                          className="button primary small"
                          onClick={() => setCasualResultId(r.id)}
                        >
                          Resolve casual result
                        </button>
                        <Link className="button secondary small" to="/casual">
                          Casual games & history
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {!disputes.length && !casualDisputes.length && <Empty title="No disputed results" />}
            </Section>
            <Section
              title="Overdue fixtures"
              subtitle="Contact the players and agree a new week. No automatic loss is applied."
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
      {resolvingCasual && (
        <CasualResultForm
          key={resolvingCasual.id}
          result={resolvingCasual}
          resolve
          onClose={() => setCasualResultId(undefined)}
        />
      )}
      {modal === 'deleteUser' && editing && (
        <Confirm
          title={`Delete ${editing.name}?`}
          label="Yes, delete user"
          cancelLabel="No"
          onClose={close}
          onConfirm={() => {
            void run(
              { type: 'deleteUser', id: editing.id },
              'User account deleted. Match history has been preserved.',
            ).then((ok) => {
              if (ok) close();
            });
          }}
        >
          This permanently removes their sign-in account and profile photo and cancels their future
          table reservations. Their name is replaced with “Deleted user” in retained match records.
          This cannot be undone.
        </Confirm>
      )}
      {modal === 'player' && <PlayerForm player={editing} onClose={close} />}{' '}
      {modal === 'season' && <SeasonForm onClose={close} />}{' '}
      {modal === 'settings' && <SeasonForm edit onClose={close} />}{' '}
      {modal === 'latePlayer' && <AddSeasonPlayerForm onClose={close} />}{' '}
      {(modal === 'end' || modal === 'delete') && (
        <SeasonLifecycleForm deleting={modal === 'delete'} onClose={close} />
      )}
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
          settings will then be locked. No playing date or time is assigned.
        </Confirm>
      )}
    </>
  );
}
