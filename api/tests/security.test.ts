import { describe, it, expect } from 'vitest';
import { allowedEmail } from '../src/access';
import { commandSchema, requestSchema } from '../src/validation';
import { privateSnapshot } from '../src/state';
import { createSeed } from '../../src/data/seed';
describe('API security boundary', () => {
  it('only accepts exact configured work-email domains', () => {
    expect(allowedEmail('name@virtuoso.tech', ['virtuoso.tech'])).toBe(true);
    for (const email of [
      'name@evilvirtuoso.tech',
      'name@virtuoso.tech.evil',
      'name@sub.virtuoso.tech',
    ])
      expect(allowedEmail(email, ['virtuoso.tech'])).toBe(false);
    expect(allowedEmail('name@virtuoso.tech', [])).toBe(false);
  });
  it('allows valid personal addresses only when any-domain access is explicitly configured', () => {
    expect(allowedEmail('name@outlook.com', ['*'])).toBe(true);
    expect(allowedEmail(' name@VIRTUOSO.TECH ', ['virtuoso.tech'])).toBe(true);
    expect(allowedEmail('name@outlook.com', ['virtuoso.tech'])).toBe(false);
    for (const email of ['', 'not-an-email', 'a@b@outlook.com', 'name@'])
      expect(allowedEmail(email, ['*'])).toBe(false);
  });
  it('rejects client identity, unknown commands, arbitrary roles and missing concurrency tokens', () => {
    expect(
      requestSchema.safeParse({
        command: { type: 'readNotifications', ids: [] },
        currentUserId: 'p01',
      }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ type: 'reset' }).success).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'savePlayer',
        id: crypto.randomUUID(),
        name: 'A',
        department: 'B',
        active: true,
        role: 'admin',
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'submit',
        fixtureId: crypto.randomUUID(),
        score: { home: 2, away: 1 },
        actorId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
  it('accepts only 15/30-minute booking commands', () => {
    const command = {
      type: 'saveBooking',
      booking: { kind: 'casual', startAt: '2026-10-24T23:45:00Z', guestIds: [], duration: 30 },
    };
    for (const duration of [15, 30])
      expect(
        commandSchema.safeParse({ ...command, booking: { ...command.booking, duration } }).success,
      ).toBe(true);
    expect(
      commandSchema.safeParse({ ...command, booking: { ...command.booking, duration: 60 } })
        .success,
    ).toBe(false);
  });
  it('filters private notifications and availability from regular-user snapshots', () => {
    const state = createSeed();
    state.currentUserId = 'p02';
    const view = privateSnapshot(state);
    expect(view.notifications.every((n) => n.userId === 'p02')).toBe(true);
    expect(view.availability.every((a) => a.playerId === 'p02')).toBe(true);
    state.currentUserId = 'p01';
    expect(privateSnapshot(state).availability).toEqual(state.availability);
  });
});
