import { useState } from 'react';
import { authenticatedRequest } from '../data/apiRepository';
import { emailQueueSummary, sendPendingEmails, type EmailQueueStatus } from '../data/emailQueue';

export function ResultEmailStatus() {
  const [status, setStatus] = useState<EmailQueueStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh(send = false) {
    setBusy(true);
    setError('');
    try {
      if (send) await sendPendingEmails(setStatus);
      else setStatus(await authenticatedRequest<EmailQueueStatus>('/admin/result-emails'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email status unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-season">
      <h3>Email delivery</h3>
      <p>Newsletters, result reviews, join confirmations and administrator alerts.</p>
      <div className="admin-actions">
        <button className="button secondary small" disabled={busy} onClick={() => void refresh()}>
          Check email queue
        </button>
        {status?.enabled && status.ready && (
          <button
            className="button secondary small"
            disabled={busy || !status.due}
            onClick={() => void refresh(true)}
          >
            {busy ? 'Sending…' : 'Send pending emails'}
          </button>
        )}
      </div>
      {status && (
        <p role="status">
          {!status.enabled
            ? 'Result emails are disabled.'
            : !status.ready
              ? 'Apply the result-email database migration before enabling delivery.'
              : emailQueueSummary(status)}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
