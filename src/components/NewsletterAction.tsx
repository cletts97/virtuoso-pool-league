import { useState } from 'react';
import { liveMode } from '../auth/client';
import { authenticatedRequest } from '../data/apiRepository';
import { Modal } from './ui';
import type { NewsletterPreview } from '../data/newsletter';

export function NewsletterAction() {
  const [preview, setPreview] = useState<NewsletterPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setPreview(await authenticatedRequest<NewsletterPreview>('/admin/newsletter'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const result = await authenticatedRequest<{ queued: number }>('/admin/newsletter', {
        previewKey: preview.previewKey,
      });
      setMessage(
        `Newsletter queued for ${result.queued} active users. Check the email queue for delivery progress or retries.`,
      );
      setPreview({ ...preview, alreadyQueued: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-season">
      <h3>Weekly newsletter</h3>
      <p>
        Preview this week's published fixtures and last week's confirmed league results, then send
        to all active users. The same weekly newsletter can only be queued once.
      </p>
      <button className="button secondary" disabled={!liveMode || busy} onClick={() => void load()}>
        {busy ? 'Loading…' : 'Preview this week’s newsletter'}
      </button>
      {!liveMode && (
        <p className="field-help">
          Newsletter preview and sending are available when connected to the backend.
        </p>
      )}
      {error && !preview && <p role="alert">{error}</p>}
      {preview && (
        <Modal
          title="Weekly newsletter preview"
          onClose={() => {
            if (!busy) setPreview(undefined);
          }}
        >
          <div className="form-stack">
            <p>
              <strong>{preview.recipientCount} active users</strong> · Week commencing{' '}
              {preview.week}. Each recipient's email highlights their own fixtures.
            </p>
            {!preview.recipientCount ? (
              <p>No upcoming published league fixtures this week. No newsletter will be sent.</p>
            ) : (
              <>
                <p>
                  <strong>{preview.subject}</strong>
                  <br />
                  Example for {preview.sampleRecipient}.
                </p>
                <iframe
                  title="Newsletter email preview"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={preview.html}
                  style={{ width: '100%', height: 420, border: 0, borderRadius: 8 }}
                />
                <details>
                  <summary>Plain-text version</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{preview.body}</pre>
                </details>
              </>
            )}
            {preview.alreadyQueued && !message && (
              <p>
                This week's newsletter has already been queued or sent. Use the email queue controls
                for retries.
              </p>
            )}
            {!preview.enabled && (
              <p>
                Email delivery is disabled. Configure the existing Resend settings before sending.
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
            <p className="field-help">
              Confirm below to queue real emails to all active users. This shares duplicate
              protection with the scheduled Monday newsletter.
            </p>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setPreview(undefined)}
              >
                Close
              </button>
              <button className="button secondary" disabled={busy} onClick={() => void load()}>
                Refresh preview
              </button>
              <button
                className="button primary"
                disabled={
                  busy || !preview.enabled || !preview.recipientCount || preview.alreadyQueued
                }
                onClick={() => void send()}
              >
                {busy ? 'Working…' : 'Confirm and send newsletter'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
