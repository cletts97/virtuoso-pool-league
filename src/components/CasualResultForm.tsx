import { useState, type FormEvent } from 'react';
import { useLeague } from '../app/LeagueContext';
import { dateOnly, scoreOptions } from '../domain/rules';
import type { CasualResult, Player } from '../domain/types';
import { Modal } from './ui';

export function TeamPicker({
  label,
  ids,
  players,
  onChange,
  disabled = false,
}: {
  label: string;
  ids: string[];
  players: Player[];
  onChange(ids: string[]): void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="casual-team" disabled={disabled}>
      <legend>{label}</legend>
      {ids.map((id, i) => (
        <label key={i}>
          <span className="sr-only">
            {label} player {i + 1}
          </span>
          <select
            aria-label={`${label} player ${i + 1}`}
            value={id}
            required
            onChange={(e) => onChange(ids.map((old, n) => (n === i ? e.target.value : old)))}
          >
            <option value="">Choose player</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
                {!p.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}

export function CasualResultForm({
  result,
  resolve = false,
  onClose,
}: {
  result?: CasualResult;
  resolve?: boolean;
  onClose(): void;
}) {
  const { state, run, busy } = useLeague();
  const [id] = useState(() => result?.id ?? crypto.randomUUID());
  const [home, setHome] = useState(result?.homePlayerIds ?? [state.currentUserId]);
  const [away, setAway] = useState(result?.awayPlayerIds ?? ['']);
  const [bestOf, setBestOf] = useState<CasualResult['bestOf']>(result?.bestOf ?? 3);
  const [playedOn, setPlayedOn] = useState(result?.playedOn ?? dateOnly());
  const [chosen, setChosen] = useState(result ? `${result.score.home}:${result.score.away}` : '');
  const [reason, setReason] = useState('');
  const players = state.players.filter(
    (p) => p.active || (result && [...home, ...away].includes(p.id)),
  );
  const scores =
    bestOf === 1
      ? [
          { home: 1, away: 0 },
          { home: 0, away: 1 },
        ]
      : scoreOptions(bestOf);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const [homeScore, awayScore] = chosen.split(':').map(Number);
    const score = { home: homeScore, away: awayScore };
    const ok = await run(
      resolve
        ? { type: 'resolveCasual', id, score, reason }
        : {
            type: 'submitCasual',
            result: { id, homePlayerIds: home, awayPlayerIds: away, playedOn, bestOf, score },
          },
      resolve
        ? 'Casual result corrected and confirmed.'
        : 'Result submitted for an opposing player to confirm.',
    );
    if (ok) onClose();
  }
  return (
    <Modal
      title={
        resolve
          ? 'Resolve or correct result'
          : result
            ? 'Resubmit casual result'
            : 'Record casual result'
      }
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Game type
          <select
            aria-label="Game type"
            disabled={!!result}
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
          <TeamPicker
            label="Side A"
            ids={home}
            players={players}
            onChange={setHome}
            disabled={!!result}
          />
          <TeamPicker
            label="Side B"
            ids={away}
            players={players}
            onChange={setAway}
            disabled={!!result}
          />
        </div>
        <label>
          Date played
          <input
            type="date"
            value={playedOn}
            max={dateOnly()}
            disabled={resolve}
            onChange={(e) => setPlayedOn(e.target.value)}
            required
          />
        </label>
        <label>
          Match format
          <select
            value={bestOf}
            disabled={resolve}
            onChange={(e) => {
              setBestOf(Number(e.target.value) as CasualResult['bestOf']);
              setChosen('');
            }}
          >
            {[1, 3, 5, 7].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'One frame' : `Best of ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Score (Side A – Side B)
          <select value={chosen} required onChange={(e) => setChosen(e.target.value)}>
            <option value="">Choose completed score</option>
            {scores.map((s) => (
              <option key={`${s.home}:${s.away}`} value={`${s.home}:${s.away}`}>
                {s.home} – {s.away}
              </option>
            ))}
          </select>
        </label>
        {resolve && (
          <label>
            Reason
            <textarea
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <p className="field-help">
          Casual games never affect league standings. An opposing player must confirm the result.
          For doubles, a teammate cannot approve your submission.
        </p>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            {resolve ? 'Confirm correction' : 'Submit result'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
