import { describe, expect, it, vi } from 'vitest';
import { sendPendingEmails, type EmailQueueStatus } from './emailQueue';

const status = (due: number, retrying = 0): EmailQueueStatus => ({
  enabled: true,
  ready: true,
  pending: due + retrying,
  failed: 0,
  sent: 10,
  due,
  retrying,
  sending: 0,
  nextAttemptAt: null,
});
describe('email queue continuation', () => {
  it('automatically continues through every available batch without another click', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(status(25))
      .mockResolvedValueOnce(status(5))
      .mockResolvedValueOnce(status(0));
    const progress = vi.fn();
    expect(await sendPendingEmails(progress, request)).toMatchObject({ due: 0 });
    expect(request).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledTimes(3);
  });
  it('stops when only delayed retries remain, without bypassing backoff', async () => {
    const request = vi.fn().mockResolvedValue(status(0, 3));
    expect(await sendPendingEmails(undefined, request)).toMatchObject({ retrying: 3 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('propagates a failed batch instead of looping or reporting success', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    await expect(sendPendingEmails(undefined, request)).rejects.toThrow('Network unavailable');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
