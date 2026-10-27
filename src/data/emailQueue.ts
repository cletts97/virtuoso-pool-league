import { authenticatedRequest } from './apiRepository';

export interface EmailQueueStatus {
  enabled: boolean;
  ready: boolean;
  pending: number;
  failed: number;
  sent: number;
  due: number;
  sending: number;
  retrying: number;
  nextAttemptAt: string | null;
}

/** Continue short HTTP batches automatically; failed attempts keep their retry delay. */
export async function sendPendingEmails(
  onProgress: (status: EmailQueueStatus) => void = () => {},
  request = () => authenticatedRequest<EmailQueueStatus>('/admin/result-emails', {}),
) {
  let status: EmailQueueStatus;
  do {
    status = await request();
    onProgress(status);
  } while (status.enabled && status.ready && status.due > 0);
  return status;
}

export function emailQueueSummary(status: EmailQueueStatus) {
  return (
    `${status.pending} queued · ${status.sent} accepted by Resend · ${status.failed} failed or expired. ` +
    (status.retrying > 0
      ? `${status.retrying} waiting to retry${status.nextAttemptAt ? ` after ${new Date(status.nextAttemptAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}.`
      : status.sending > 0
        ? 'Delivery is in progress.'
        : status.pending
          ? 'Pending delivery.'
          : 'No emails waiting to send.')
  );
}
