import { useState, type FormEvent } from 'react';
import { useLeague } from '../app/LeagueContext';
import { dateOnly, weekStart } from '../domain/rules';
import { Modal } from './ui';
import { SeasonAdditionPreview } from './SeasonAdditionPreview';

export function AddSeasonPlayerForm({ onClose }: { onClose(): void }) {
  const { state, season, run, busy } = useLeague();
  const memberIds = new Set(
    state.participants
      .filter((p) => season.participantIds.includes(p.id))
      .flatMap((p) => p.playerIds),
  );
  const available = state.players.filter((p) => p.active && !memberIds.has(p.id));
  const [playerId, setPlayerId] = useState(available[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(
    [weekStart(dateOnly()), weekStart(season.startDate)].sort().at(-1)!,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await run(
        { type: 'addSeasonPlayer', seasonId: season.id, playerId, dueDate },
        season.status === 'draft'
          ? 'Player added to the draft season.'
          : 'Player added. Fixtures have been scheduled in available weekly places.',
      )
    )
      onClose();
  }
  return (
    <Modal title="Add a player to this season" onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label>
          Player
          <select
            required
            value={playerId}
            disabled={!available.length || busy}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            {!available.length && <option value="">No eligible accounts</option>}
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!available.length && <p>Invite an active colleague who is not already in this season.</p>}
        {season.status !== 'draft' && (
          <label>
            First fixture week (Monday)
            <input
              type="date"
              required
              min={[weekStart(dateOnly()), weekStart(season.startDate)].sort().at(-1)}
              value={dueDate}
              onChange={(event) => event.target.value && setDueDate(weekStart(event.target.value))}
            />
          </label>
        )}
        <p className="field-help">
          {season.status === 'draft'
            ? 'Adds this player to the draft. Fixtures will include them when you generate the schedule.'
            : 'Adds one best-of-three match against each existing player.'}
        </p>
        <SeasonAdditionPreview season={season} firstWeek={dueDate} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !playerId}>
            {busy
              ? 'Adding…'
              : season.status === 'draft'
                ? 'Add player'
                : `Add player and ${season.participantIds.length} fixtures`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
