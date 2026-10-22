import { useState, type FormEvent } from 'react';
import { useLeague } from '../app/LeagueContext';
import { dateOnly, weekStart } from '../domain/rules';
import type { Player } from '../domain/types';
import { Modal } from './ui';

function FormActions({ onClose, label = 'Save changes' }: { onClose(): void; label?: string }) {
  const { busy } = useLeague();
  return (
    <div className="form-actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" disabled={busy} className="button primary">
        {label}
      </button>
    </div>
  );
}
export function PlayerForm({ player, onClose }: { player?: Player; onClose(): void }) {
  const { run } = useLeague();
  const [name, setName] = useState(player?.name ?? '');
  const [department, setDepartment] = useState(player?.department ?? '');
  const [active, setActive] = useState(player?.active ?? true);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await run(
        { type: 'savePlayer', id: player?.id, name, department, active },
        player
          ? 'Player updated. Historical results are preserved.'
          : 'Player added. Include them when creating a new season.',
      )
    )
      onClose();
  }
  return (
    <Modal title={player ? 'Edit player' : 'Add a player'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={70} />
        </label>
        <label>
          Department
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
            maxLength={70}
          />
        </label>
        {player && (
          <label className="checkbox-label">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active player
          </label>
        )}
        <p className="field-help">
          Deactivation removes application access and new-season eligibility. Existing fixtures and
          history are preserved. Reactivate a player to let them confirm outstanding results.
        </p>
        <FormActions onClose={onClose} />
      </form>
    </Modal>
  );
}
export function SeasonForm({ edit = false, onClose }: { edit?: boolean; onClose(): void }) {
  const { state, season, run } = useLeague();
  const available = state.players
    .filter((player) => player.active)
    .map((player) => ({
      id:
        state.participants.find(
          (entry) =>
            entry.kind === 'individual' &&
            entry.playerIds.length === 1 &&
            entry.playerIds[0] === player.id,
        )?.id ?? player.id,
      name: player.name,
    }));
  const [name, setName] = useState(edit ? season.name : '');
  const [startDate, setStartDate] = useState(weekStart(edit ? season.startDate : dateOnly()));
  const [rounds, setRounds] = useState(edit ? season.config.roundsPerWeek : 2);
  const [selected, setSelected] = useState(available.map((p) => p.id));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = edit
      ? await run({
          type: 'updateSeason',
          seasonId: season.id,
          name,
          startDate,
          roundsPerWeek: rounds,
        })
      : await run(
          {
            type: 'createSeason',
            name,
            startDate,
            participantIds: selected,
            roundsPerWeek: rounds,
          },
          'Draft season created. Generate its fixtures when you’re ready.',
        );
    if (ok) onClose();
  }
  return (
    <Modal title={edit ? 'Season settings' : 'Create a season'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Season name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Winter League 2027"
          />
        </label>
        <div className="form-grid">
          <label>
            Start week (Monday)
            <input
              required
              type="date"
              disabled={edit && season.status !== 'draft'}
              value={startDate}
              onChange={(e) => e.target.value && setStartDate(weekStart(e.target.value))}
            />
          </label>
          <label>
            Rounds per week
            <input
              required
              type="number"
              min={1}
              max={7}
              disabled={edit && season.status !== 'draft'}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
        </div>
        {!edit && (
          <fieldset>
            <legend>Players · {selected.length} selected</legend>
            <div className="participant-checklist">
              {available.map((p) => (
                <label className="checkbox-label" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="field-help">
          Singles round-robin · Best of 3 · Top 4 playoffs. Scheduling settings lock when fixtures
          are generated. Administrators can add players during the regular season. An odd number of
          players receives rotating byes in the initial schedule.
        </p>
        <FormActions onClose={onClose} label={edit ? 'Save settings' : 'Create draft season'} />
      </form>
    </Modal>
  );
}
export function FinalizeForm({ onClose }: { onClose(): void }) {
  const { season, state, run } = useLeague();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const unresolved = state.fixtures.filter(
    (f) => f.seasonId === season.id && f.stage === 'regular' && f.status !== 'confirmed',
  ).length;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      confirm &&
      (await run(
        { type: 'finalize', seasonId: season.id, reason },
        'Regular season finalized. Playoff seeds are locked.',
      ))
    )
      onClose();
  }
  return (
    <Modal title="Finalize the regular season?" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p className="info-banner">
          This locks the top four based on currently confirmed results and creates the semifinals.{' '}
          {unresolved} unresolved fixtures will close without wins or losses. Pending and disputed
          scores will not count. This action cannot be undone in the demo.
        </p>
        <label>
          Reason for finalizing
          <textarea
            required
            minLength={5}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            required
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          I have reviewed the unresolved fixtures and qualification positions.
        </label>
        <FormActions onClose={onClose} label="Finalize and seed playoffs" />
      </form>
    </Modal>
  );
}
export function AnnouncementForm({ onClose }: { onClose(): void }) {
  const { season, run } = useLeague();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await run(
        { type: 'announce', seasonId: season.id, title, body },
        'Announcement posted to the league and in-app inboxes.',
      )
    )
      onClose();
  }
  return (
    <Modal title="Post a league notice" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Title
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            required
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <p className="field-help">Posted to {season.name}. No email will be sent.</p>
        <FormActions onClose={onClose} label="Post announcement" />
      </form>
    </Modal>
  );
}
