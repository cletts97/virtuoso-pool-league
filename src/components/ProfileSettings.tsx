import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { Avatar, Modal } from './ui';
import { prepareProfilePhoto } from '../data/profilePhoto';

export function ProfileSettings() {
  const { state, run, saveAvatar, busy } = useLeague();
  const user = state.players.find((p) => p.id === state.currentUserId)!;
  const needsName = user.name === 'Invited colleague';
  const [open, setOpen] = useState(needsName);
  const [name, setName] = useState(needsName ? '' : user.name);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  async function upload(file: File) {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await saveAvatar(await prepareProfilePhoto(file));
    } catch (error) {
      setPhotoError((error as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await run({ type: 'updateProfile', name }, 'Display name updated.')) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="Edit your profile"
        title="Edit your profile"
        onClick={() => {
          setName(user.name === 'Invited colleague' ? '' : user.name);
          setPhotoError('');
          setOpen(true);
        }}
      >
        <Avatar id={user.id} />
      </button>
      {open && (
        <Modal title="Your profile" onClose={() => setOpen(false)}>
          <div className="form-stack">
            <Avatar id={user.id} large />
            <label>
              Profile photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || photoBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
            <p className="field-help">
              JPG, PNG or WebP, up to 5 MB. Photos are cropped to a square.
            </p>
            {photoBusy && <p role="status">Preparing and saving photo…</p>}
            {photoError && (
              <p className="form-error" role="alert">
                {photoError}
              </p>
            )}
            {user.avatarUrl && (
              <button
                className="text-link"
                type="button"
                disabled={busy || photoBusy}
                onClick={() => void saveAvatar(null)}
              >
                Remove photo
              </button>
            )}
          </div>
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
            <button className="button primary" disabled={busy || photoBusy}>
              {busy ? 'Saving…' : 'Save display name'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
