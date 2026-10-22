import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { canReviewCasual, casualHeadToHead } from '../domain/casual';
import type { CasualResult } from '../domain/types';
import { Avatar, Badge, Empty, Modal, PageHeading, Section } from '../components/ui';
import { CasualResultForm, TeamPicker } from '../components/CasualResultForm';
import '../casual.css';

export function CasualGames() {
  const { state, run, busy } = useLeague();
  const [params] = useSearchParams();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const players = state.players.filter(
    (p) =>
      p.id !== 'public-visitor' &&
      (p.active ||
        (state.casualResults ?? []).some((r) =>
          [...r.homePlayerIds, ...r.awayPlayerIds].includes(p.id),
        )),
  );
  const [home, setHome] = useState([params.get('player') || players[0]?.id || '']);
  const [away, setAway] = useState([players.find((p) => p.id !== home[0])?.id || '']);
  const [form, setForm] = useState<'new' | { result: CasualResult; resolve: boolean }>();
  const [action, setAction] = useState<{ result: CasualResult; void: boolean }>();
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('all');
  const [playerFilter, setPlayerFilter] = useState('');
  const results = (state.casualResults ?? []).filter(
    (r) =>
      r.status === 'confirmed' ||
      (!state.readOnly &&
        (user.role === 'admin' || [...r.homePlayerIds, ...r.awayPlayerIds].includes(user.id))),
  );
  const totals = casualHeadToHead(results, home, away);
  const selectionValid =
    home.length === away.length &&
    [...home, ...away].every(Boolean) &&
    new Set([...home, ...away]).size === home.length * 2;
  const name = (ids: string[]) =>
    ids.map((id) => state.players.find((p) => p.id === id)?.name ?? 'Unknown player').join(' & ');
  const displayed = results
    .filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!playerFilter || [...r.homePlayerIds, ...r.awayPlayerIds].includes(playerFilter)),
    )
    .sort((a, b) => b.playedOn.localeCompare(a.playedOn) || b.id.localeCompare(a.id));
  return (
    <>
      <PageHeading
        eyebrow="CASUAL GAMES"
        title="Casual results"
        description="Record friendly games and compare singles or doubles records. Separate from the league, across all dates."
        action={
          state.readOnly ? (
            <Link className="button primary" to="/login">
              Sign in to record a game
            </Link>
          ) : (
            <button
              className="button primary"
              disabled={state.casualResultsEnabled === false}
              onClick={() => setForm('new')}
            >
              <Plus size={17} />
              Record a game
            </button>
          )
        }
      />
      {state.casualResultsEnabled === false && (
        <p className="action-banner">
          Casual results are not available yet. Please contact the administrator.
        </p>
      )}
      {results.some((r) => canReviewCasual(r, user.id)) && (
        <p className="action-banner">You have casual results to confirm below.</p>
      )}
      <Section
        title="Head to head"
        subtitle="Confirmed casual games only. Doubles records compare exact teams, regardless of player order."
      >
        <div className="casual-content form-stack">
          <label>
            Game type
            <select
              aria-label="Game type"
              value={home.length}
              onChange={(e) => {
                const size = Number(e.target.value);
                setHome(size === 1 ? [home[0]] : [home[0], '']);
                setAway(size === 1 ? [away[0]] : [away[0], '']);
              }}
            >
              <option value={1}>Singles</option>
              <option value={2}>Doubles</option>
            </select>
          </label>
          <div className="casual-teams">
            <TeamPicker label="Team A" ids={home} players={players} onChange={setHome} />
            <TeamPicker label="Team B" ids={away} players={players} onChange={setAway} />
          </div>
          {selectionValid ? (
            <div className="casual-totals" aria-live="polite">
              <div>
                <strong>{totals.won}</strong>
                <span>{name(home)} · wins</span>
              </div>
              <div>
                <strong>{totals.lost}</strong>
                <span>{name(away)} · wins</span>
              </div>
              <p>
                {totals.played} confirmed games · Frames {totals.framesFor} – {totals.framesAgainst}
              </p>
            </div>
          ) : (
            <p className="field-help">
              Choose {home.length === 1 ? 'two' : 'four'} distinct players to compare.
            </p>
          )}
        </div>
      </Section>
      <Section
        title="Game history"
        subtitle="Pending or disputed games do not count towards records."
      >
        <div className="filter-bar">
          <label>
            Player
            <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
              <option value="">All players</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['all', 'pending', 'confirmed', 'disputed', 'cancelled'].map((v) => (
                <option key={v} value={v}>
                  {v === 'all'
                    ? 'All statuses'
                    : v === 'cancelled'
                      ? 'Voided'
                      : v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="casual-history">
          {displayed.map((r) => (
            <article className="casual-game" key={r.id}>
              <header>
                <span>
                  {r.playedOn} · {r.homePlayerIds.length === 2 ? 'Doubles' : 'Singles'} ·{' '}
                  {r.bestOf === 1 ? 'One frame' : `Best of ${r.bestOf}`}
                </span>
                <Badge status={r.status} />
              </header>
              <div className="casual-score">
                <div>
                  {r.homePlayerIds.map((id) => (
                    <Avatar key={id} id={id} />
                  ))}
                  <strong>{name(r.homePlayerIds)}</strong>
                </div>
                <b>
                  {r.score.home} – {r.score.away}
                </b>
                <div>
                  {r.awayPlayerIds.map((id) => (
                    <Avatar key={id} id={id} />
                  ))}
                  <strong>{name(r.awayPlayerIds)}</strong>
                </div>
              </div>
              <div className="casual-actions">
                {!state.readOnly && canReviewCasual(r, user.id) && (
                  <>
                    <button
                      className="button primary small"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          { type: 'reviewCasual', id: r.id, approve: true, reason: '' },
                          'Casual result confirmed.',
                        )
                      }
                    >
                      Confirm result
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setReason('');
                        setAction({ result: r, void: false });
                      }}
                    >
                      Dispute
                    </button>
                  </>
                )}
                {!state.readOnly && r.status === 'disputed' && r.submittedBy === user.id && (
                  <button
                    className="button secondary small"
                    onClick={() => setForm({ result: r, resolve: false })}
                  >
                    Resubmit result
                  </button>
                )}
                {!state.readOnly && user.role === 'admin' && r.status !== 'cancelled' && (
                  <>
                    <button
                      className="button secondary small"
                      onClick={() => setForm({ result: r, resolve: true })}
                    >
                      Resolve / correct
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setReason('');
                        setAction({ result: r, void: true });
                      }}
                    >
                      Void result
                    </button>
                  </>
                )}
              </div>
              {!!r.history.length && (
                <details>
                  <summary>Result history</summary>
                  <ul>
                    {r.history.map((h) => (
                      <li key={h.id}>
                        {h.at.slice(0, 10)} · {h.action} ·{' '}
                        {state.players.find((p) => p.id === h.actorId)?.name ?? 'Former account'}
                        {h.score ? ` · ${h.score.home}–${h.score.away}` : ''}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
          {!displayed.length && (
            <Empty title="No casual games found">
              Record a game after playing, then ask an opposing player to confirm it.
            </Empty>
          )}
        </div>
      </Section>
      {form && (
        <CasualResultForm
          result={form === 'new' ? undefined : form.result}
          resolve={form !== 'new' && form.resolve}
          onClose={() => setForm(undefined)}
        />
      )}
      {action && (
        <Modal
          title={action.void ? 'Void casual result?' : 'Dispute casual result'}
          onClose={() => setAction(undefined)}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  action.void
                    ? { type: 'voidCasual', id: action.result.id, reason }
                    : { type: 'reviewCasual', id: action.result.id, approve: false, reason },
                  action.void ? 'Result voided. History preserved.' : 'Result disputed.',
                )
              )
                setAction(undefined);
            }}
          >
            <p className="field-help">
              {action.void
                ? 'This removes the game from head-to-head totals and preserves its history.'
                : 'The submitting player can correct and resubmit the result, or an administrator can resolve it.'}
            </p>
            <label>
              Reason
              <textarea
                required
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {action.void ? 'Void result' : 'Dispute result'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
