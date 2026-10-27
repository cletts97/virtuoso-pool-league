import { describe, it, expect } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';
import { dateOnly, addDays } from '../domain/rules';
import { canJoinSeasonDirectly } from '../domain/seasonManagement';
function setup(upcoming = true) {
  const state = executeCommand(createSeed(), {
    type: 'createSeason',
    name: 'League',
    startDate: upcoming ? addDays(dateOnly(), 7) : dateOnly(),
    participantIds: ['p01', 'p02', 'p03', 'p04'],
    roundsPerWeek: 2,
  });
  return { state, id: state.selectedSeasonId };
}
describe('season joining', () => {
  it('joins a draft immediately without notifying administrators for approval', () => {
    const { state, id } = setup();
    state.currentUserId = 'colleague-01';
    const joined = executeCommand(state, { type: 'joinSeason', seasonId: id });
    expect(joined.seasons[0].participantIds).toHaveLength(5);
    expect(joined.fixtures).toEqual(state.fixtures);
    expect(joined.joinRequests![0]).toMatchObject({
      status: 'approved',
      reviewedBy: 'colleague-01',
    });
    expect(
      joined.notifications
        .filter((n) => n.joinRequestId === joined.joinRequests![0].id)
        .map((n) => n.userId),
    ).toEqual(['colleague-01']);
    expect(() => executeCommand(joined, { type: 'joinSeason', seasonId: id })).toThrow(
      'already in',
    );
  });
  it('joins a future published league without replacing existing fixtures', () => {
    const { state, id } = setup();
    const published = executeCommand(state, { type: 'generate', seasonId: id });
    published.currentUserId = 'colleague-01';
    const joined = executeCommand(published, { type: 'joinSeason', seasonId: id });
    expect(joined.fixtures.slice(0, published.fixtures.length)).toEqual(published.fixtures);
    const added = joined.fixtures.slice(published.fixtures.length);
    expect(added).toHaveLength(4);
    expect(
      added.every(
        (f) =>
          f.status === 'scheduled' &&
          f.dueDate >= state.seasons[0].startDate &&
          f.history[0].actorId === 'colleague-01',
      ),
    ).toBe(true);
  });
  it('requires approval once the start week begins, appending catch-up matches once', () => {
    const { state, id } = setup(false);
    const published = executeCommand(state, { type: 'generate', seasonId: id });
    published.currentUserId = 'colleague-01';
    expect(() => executeCommand(published, { type: 'joinSeason', seasonId: id })).toThrow(
      'has started',
    );
    const pending = executeCommand(published, { type: 'requestSeasonJoin', seasonId: id });
    const request = pending.joinRequests![0];
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
        dueDate: addDays(dateOnly(), 14),
      }),
    ).toThrow('Administrator');
    pending.currentUserId = 'p01';
    const joined = executeCommand(pending, {
      type: 'reviewSeasonJoin',
      id: request.id,
      approve: true,
      dueDate: addDays(dateOnly(), 14),
    });
    expect(joined.fixtures.slice(0, published.fixtures.length)).toEqual(published.fixtures);
    expect(
      joined.fixtures.slice(published.fixtures.length).every((f) => f.status === 'scheduled'),
    ).toBe(true);
    expect(joined.joinRequests![0].status).toBe('approved');
    expect(() =>
      executeCommand(joined, {
        type: 'reviewSeasonJoin',
        id: request.id,
        approve: true,
        dueDate: dateOnly(),
      }),
    ).toThrow('no longer pending');
  });
  it('handles the start-week boundary and blocks anonymous or closed-season joining', () => {
    const { state, id } = setup();
    const season = state.seasons[0];
    season.status = 'regular';
    season.startDate = '2026-10-26';
    expect(canJoinSeasonDirectly(season, '2026-10-25')).toBe(true);
    expect(canJoinSeasonDirectly(season, '2026-10-26')).toBe(false);
    state.currentUserId = 'colleague-01';
    expect(() =>
      executeCommand({ ...state, readOnly: true }, { type: 'joinSeason', seasonId: id }),
    ).toThrow('Sign in');
    season.status = 'complete';
    expect(() => executeCommand(state, { type: 'joinSeason', seasonId: id })).toThrow(
      'has started',
    );
  });
});
