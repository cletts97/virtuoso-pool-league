import { useState } from 'react';
import { authenticatedRequest } from '../data/apiRepository';
import { Modal } from './ui';
export function AccountManagement() {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await authenticatedRequest<{ message: string }>('/admin/invitations', {
        name,
        email,
      });
      setMessage(result.message);
      setEmail('');
      setName('');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-season">
      <h2>Colleague accounts</h2>
      <p>
        Invite colleagues to book casually or select them when creating a season. No separate league
        enrollment is needed.
      </p>
      <button
        className="button primary"
        onClick={() => {
          setMessage('');
          setOpen(true);
        }}
      >
        Invite colleague
      </button>
      {open && (
        <Modal title="Invite a colleague" onClose={() => setOpen(false)}>
          <form className="form-stack" onSubmit={(e) => void invite(e)}>
            <label>
              Full name
              <input
                required
                maxLength={70}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <p className="field-help">
              The invitation gives access as a colleague, never as an administrator. Email delivery
              must be enabled by the service operator.
            </p>
            {message && <p role="status">{message}</p>}
            <button className="button primary" disabled={busy}>
              Send invitation
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function ReminderAction() {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        disabled={busy}
        className="button secondary"
        onClick={() => {
          setBusy(true);
          void authenticatedRequest<{ created: number }>('/admin/reminders', {})
            .then((r) =>
              setMessage(
                `${r.created} in-app reminders created. Today's existing reminders were not duplicated.`,
              ),
            )
            .catch((e: Error) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Create due-fixture reminders
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
