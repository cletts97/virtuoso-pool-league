import { describe, it, expect, vi } from 'vitest';
import { reviewEmailIntents } from '../src/resultEmails';
import { ResendEmailDelivery } from '../src/email';
import { readConfig } from '../src/config';
import { createSeed } from '../../src/data/seed';
import { executeCommand } from '../../src/data/commands';
import { canApprove } from '../../src/domain/rules';
describe('review email delivery', () => {
  it.each([false, true])(
    'emails active administrators once for a new dispute (casual=%s)',
    (casual) => {
      let before = createSeed();
      before.players.find((p) => p.id === 'p03')!.role = 'admin';
      before.players.find((p) => p.id === 'p03')!.active = false;
      before.players.find((p) => p.id === 'p05')!.role = 'admin';
      let id: string;
      if (casual) {
        id = crypto.randomUUID();
        before.currentUserId = 'p02';
        before = executeCommand(before, {
          type: 'submitCasual',
          result: {
            id,
            homePlayerIds: ['p02', 'p06'],
            awayPlayerIds: ['p04', 'p07'],
            playedOn: '2026-01-01',
            bestOf: 3,
            score: { home: 2, away: 1 },
          },
        });
        before.currentUserId = 'p04';
      } else {
        const fixture = before.fixtures.find((f) => f.status === 'pending')!;
        id = fixture.id;
        before.currentUserId = before.players.find((p) =>
          canApprove(fixture, p.id, before.participants),
        )!.id;
      }
      const next = executeCommand(
        before,
        casual
          ? { type: 'reviewCasual', id, approve: false, reason: 'PRIVATE_REASON' }
          : { type: 'review', fixtureId: id, approve: false, reason: 'PRIVATE_REASON' },
      );
      const jobs = reviewEmailIntents(before, next, 'https://pool.example');
      expect(jobs.map((j) => j.recipientId).sort()).toEqual(['p01', 'p05']);
      expect(
        jobs.every(
          (j) =>
            j.subject.includes('disputed') &&
            j.body.includes(id) &&
            !j.body.includes('PRIVATE_REASON'),
        ),
      ).toBe(true);
      expect(reviewEmailIntents(next, next, 'https://pool.example')).toEqual([]);
    },
  );
  it('targets only opposing doubles players, and deduplicates existing submission events', () => {
    const before = createSeed();
    before.currentUserId = 'p02';
    const after = executeCommand(before, {
      type: 'submitCasual',
      result: {
        id: crypto.randomUUID(),
        homePlayerIds: ['p02', 'p03'],
        awayPlayerIds: ['p04', 'p05'],
        playedOn: '2026-01-01',
        bestOf: 3,
        score: { home: 2, away: 1 },
      },
    });
    const jobs = reviewEmailIntents(before, after, 'https://pool.example');
    expect(jobs.map((j) => j.recipientId).sort()).toEqual(['p04', 'p05']);
    expect(
      jobs.every(
        (j) => j.body.includes('/casual?result=') && j.body.includes('confirm or dispute'),
      ),
    ).toBe(true);
    expect(reviewEmailIntents(after, after, 'https://pool.example')).toEqual([]);
  });
  it('targets the league opponent and includes a protected match link', () => {
    const before = createSeed();
    const f = before.fixtures.find((r) => r.status === 'scheduled')!;
    before.currentUserId = before.participants.find((p) => p.id === f.homeId)!.playerIds[0];
    const next = executeCommand(before, {
      type: 'submit',
      fixtureId: f.id,
      score: { home: 2, away: 0 },
    });
    const jobs = reviewEmailIntents(before, next, 'https://pool.example');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].recipientId).toBe(
      before.participants.find((p) => p.id === f.awayId)!.playerIds[0],
    );
    expect(jobs[0].body).toContain('/fixtures/' + f.id);
  });
  it('uses Resend idempotency and never exposes provider bodies on failure', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const delivery = new ResendEmailDelivery('test-secret', 'pool@example.com', request);
    await delivery.send({
      recipient: 'opponent@example.com',
      subject: 'Review',
      text: 'Sign in',
      idempotencyKey: 'event/recipient',
    });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.headers).toMatchObject({ 'Idempotency-Key': 'event/recipient' });
    request.mockResolvedValueOnce(new Response('PRIVATE_ADDRESS_AND_KEY', { status: 429 }));
    await expect(
      delivery.send({
        recipient: 'a@example.com',
        subject: 'Review',
        text: 'Sign in',
        idempotencyKey: 'key',
      }),
    ).rejects.toThrow('HTTP 429');
  });
  it('requires separate Resend settings only when result emails are enabled', () => {
    const env = {
      DATABASE_URL: 'postgresql://localhost/test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SECRET_KEY: 'test',
      APP_URL: 'http://localhost:5173',
    };
    expect(readConfig(env).allowResultEmail).toBe(false);
    expect(() => readConfig({ ...env, ALLOW_RESULT_EMAIL: 'true' })).toThrow('RESEND_API_KEY');
  });
});
