import { useState, type FormEvent } from 'react';
import { useLeague } from '../app/LeagueContext';
import { Modal } from './ui';

export function SeasonLifecycleForm({ deleting, onClose }: { deleting: boolean; onClose(): void }) {
  const { season, run, busy } = useLeague();
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((!deleting && !confirmed) || (deleting && name !== season.name)) return;
    if (
      await run(
        deleting
          ? { type: 'deleteSeason', seasonId: season.id, confirmName: name }
          : { type: 'endSeason', seasonId: season.id, reason },
        deleting ? 'Season deleted.' : 'Season ended. Confirmed results are preserved.',
      )
    )
      onClose();
  }
  return (
    <Modal title={deleting ? 'Delete season?' : 'End season early?'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <p className="info-banner">
          {deleting
            ? `Permanently delete ${season.name}, its unplayed fixtures, notices and notifications. Accounts and casual games are kept. This cannot be undone.`
            : `End ${season.name} without starting playoffs or awarding a champion. Confirmed results and history are kept. Outstanding matches close without wins or losses, and future reservations for those matches are cancelled. This cannot be undone.`}
        </p>
        {deleting ? (
          <label>
            Type the season name to confirm: {season.name}
            <input
              aria-label="Confirm season name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
        ) : (
          <>
            <label>
              Reason for ending
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
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I understand this closes the season and its outstanding matches.
            </label>
          </>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy || (deleting ? name !== season.name : !confirmed)}
          >
            {deleting ? 'Delete season permanently' : 'End season'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
