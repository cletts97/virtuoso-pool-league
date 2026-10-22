import { useState } from 'react';
import { authenticatedRequest } from '../data/apiRepository';

interface QueueStatus {
  enabled: boolean;
  ready: boolean;
  pending: number;
  failed: number;
  sent: number;
}
export function ResultEmailStatus() {
  const [status, setStatus] = useState<QueueStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh(send = false) {
    setBusy(true);
    setError('');
    try {
      setStatus(
        await authenticatedRequest<QueueStatus>('/admin/result-emails', send ? {} : undefined),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email status unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-season">
      <h3>Score-review emails</h3>
      <p>Resend delivery for result reviews and administrator dispute alerts.</p>
      <div className="admin-actions">
        <button className="button secondary small" disabled={busy} onClick={() => void refresh()}>
          Check email queue
        </button>
        {status?.enabled && status.ready && (
          <button
            className="button secondary small"
            disabled={busy || !status.pending}
            onClick={() => void refresh(true)}
          >
            Retry due emails
          </button>
        )}
      </div>
      {status && (
        <p role="status">
          {!status.enabled
            ? 'Result emails are disabled.'
            : !status.ready
              ? 'Apply the result-email database migration before enabling delivery.'
              : `${status.pending} queued · ${status.sent} accepted by Resend · ${status.failed} failed or expired. Retries wait for their backoff time.`}
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
