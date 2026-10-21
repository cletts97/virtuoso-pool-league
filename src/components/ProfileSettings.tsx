import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { Avatar, Modal } from './ui';

export function ProfileSettings() {
  const { state, run, busy } = useLeague();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const needsName = user.name === 'Invited colleague';
  const [open, setOpen] = useState(needsName);
  const [name, setName] = useState(needsName ? '' : user.name);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await run({ type: 'updateProfile', name }, 'Display name updated.')) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="Edit your display name"
        title="Edit your display name"
        onClick={() => {
          setName(user.name === 'Invited colleague' ? '' : user.name);
          setOpen(true);
        }}
      >
        <Avatar id={user.id} />
      </button>
      {open && (
        <Modal title="Your display name" onClose={() => setOpen(false)}>
          <form className="form-stack" onSubmit={(event) => void save(event)}>
            <p>Choose the name colleagues will see in the league, bookings and TV display.</p>
            <label>
              Display name
              <input
                required
                maxLength={70}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save display name'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
