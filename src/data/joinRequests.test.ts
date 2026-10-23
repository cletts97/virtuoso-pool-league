import { describe, it, expect } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';
import { dateOnly, addDays } from '../domain/rules';
function setup() {
  const state = executeCommand(createSeed(), {
    type: 'createSeason',
    name: 'Upcoming league',
    startDate: addDays(dateOnly(), 7),
    participantIds: ['p01', 'p02', 'p03', 'p04'],
    roundsPerWeek: 2,
  });
  return { state, id: state.selectedSeasonId };
}
describe('season join requests', () => {
  it('notifies active administrators and accepts a draft request without creating fixtures', () => {
    const { state, id } = setup();
    state.currentUserId = 'colleague-01';
    const pending = executeCommand(state, { type: 'requestSeasonJoin', seasonId: id });
    const request = pending.joinRequests![0];
    expect(request.playerId).toBe('colleague-01');
    expect(
      pending.notifications.filter((n) => n.joinRequestId === request.id).map((n) => n.userId),
    ).toEqual(['p01']);
    expect(() => executeCommand(pending, { type: 'requestSeasonJoin', seasonId: id })).toThrow(
      'already requested',
    );
    expect(() =>
      executeCommand(pending, {
        type: 'reviewSeasonJoin',
        id: request.id,
        approve: true,
        dueDate: dateOnly(),
      }),
    ).toThrow('Administrator');
    pending.currentUserId = 'p01';
    const approved = executeCommand(pending, {
      type: 'reviewSeasonJoin',
      id: request.id,
      approve: true,
      dueDate: dateOnly(),
    });
    expect(approved.seasons[0].participantIds).toHaveLength(5);
    expect(approved.fixtures).toEqual(state.fixtures);
    expect(approved.joinRequests![0].status).toBe('approved');
    expect(
      approved.notifications.some(
        (n) => n.userId === 'colleague-01' && n.joinRequestId === request.id,
      ),
    ).toBe(true);
    expect(() =>
      executeCommand(approved, {
        type: 'reviewSeasonJoin',
        id: request.id,
        approve: true,
        dueDate: dateOnly(),
      }),
    ).toThrow('no longer pending');
  });
  it('appends catch-up fixtures to an active season without replacing existing results', () => {
    const { state, id } = setup();
    const published = executeCommand(state, { type: 'generate', seasonId: id });
    published.currentUserId = 'colleague-01';
    const pending = executeCommand(published, { type: 'requestSeasonJoin', seasonId: id });
    pending.currentUserId = 'p01';
    const approved = executeCommand(pending, {
      type: 'reviewSeasonJoin',
      id: pending.joinRequests![0].id,
      approve: true,
      dueDate: addDays(dateOnly(), 14),
    });
    expect(approved.fixtures.slice(0, published.fixtures.length)).toEqual(published.fixtures);
    expect(approved.fixtures.slice(published.fixtures.length)).toHaveLength(4);
    expect(
      approved.fixtures.slice(published.fixtures.length).every((f) => f.status === 'postponed'),
    ).toBe(true);
  });
  it('rejects members, closed seasons and anonymous users, and supports declining without enrollment', () => {
    const { state, id } = setup();
    expect(() => executeCommand(state, { type: 'requestSeasonJoin', seasonId: id })).toThrow(
      'already in',
    );
    state.currentUserId = 'colleague-01';
    expect(() =>
      executeCommand({ ...state, readOnly: true }, { type: 'requestSeasonJoin', seasonId: id }),
    ).toThrow('Sign in');
    const pending = executeCommand(state, { type: 'requestSeasonJoin', seasonId: id });
    pending.currentUserId = 'p01';
    const declined = executeCommand(pending, {
      type: 'reviewSeasonJoin',
      id: pending.joinRequests![0].id,
      approve: false,
      dueDate: dateOnly(),
    });
    expect(declined.seasons[0].participantIds).toHaveLength(4);
    expect(declined.joinRequests![0].status).toBe('rejected');
    state.seasons[0].status = 'playoffs';
    expect(() => executeCommand(state, { type: 'requestSeasonJoin', seasonId: id })).toThrow(
      'not accepting',
    );
  });
});
