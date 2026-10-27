import { describe, expect, it } from 'vitest';
import { executeCommand } from './commands';
import { createSeed } from './seed';
import { weekStart, weekEnd, addDays, dateOnly, matchStatus, standings } from '../domain/rules';

function setup(count = 4) {
  let state = createSeed();
  const adminId = state.currentUserId;
  state = executeCommand(state, {
    type: 'createSeason',
    name: 'Late entry test',
    startDate: dateOnly(),
    roundsPerWeek: 2,
    participantIds: state.players.slice(0, count).map((p) => p.id),
  });
  const seasonId = state.selectedSeasonId;
  state = executeCommand(state, { type: 'generate', seasonId });
  const entrant = state.players.find((p) => p.active && p.role === 'colleague')!;
  const dueDate = addDays(dateOnly(), 14);
  const command = { type: 'addSeasonPlayer' as const, seasonId, playerId: entrant.id, dueDate };
  return { state, adminId, command, count };
}

describe('mid-season player addition', () => {
  it.each([4, 5])(
    'preserves results and adds every unique pairing for a %i-player season',
    (count) => {
      const setupState = setup(count);
      let { state } = setupState;
      const { command, adminId } = setupState;
      const fixture = state.fixtures.find((f) => f.seasonId === command.seasonId)!;
      state.currentUserId = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
      state = executeCommand(state, {
        type: 'submit',
        fixtureId: fixture.id,
        score: { home: 2, away: 1 },
      });
      state.currentUserId = state.participants.find((p) => p.id === fixture.awayId)!.playerIds[0];
      state = executeCommand(state, {
        type: 'review',
        fixtureId: fixture.id,
        approve: true,
        reason: '',
      });
      state.currentUserId = adminId;
      const oldFixtures = structuredClone(state.fixtures);
      const next = executeCommand(state, command);
      expect(next.fixtures.slice(0, oldFixtures.length)).toEqual(oldFixtures);
      const added = next.fixtures.slice(oldFixtures.length);
      expect(added).toHaveLength(count);
      expect(
        added.every(
          (f) =>
            f.bestOf === 3 && f.status === 'scheduled' && f.dueDate >= weekStart(command.dueDate),
        ),
      ).toBe(true);
      expect(added.every((f) => matchStatus(f, addDays(weekEnd(f.dueDate), 1)) === 'overdue')).toBe(
        true,
      );
      const season = next.seasons.find((s) => s.id === command.seasonId)!;
      const matches = next.fixtures.filter((f) => f.seasonId === season.id);
      expect(matches).toHaveLength((count * (count + 1)) / 2);
      expect(new Set(matches.map((f) => [f.homeId, f.awayId].sort().join(':'))).size).toBe(
        matches.length,
      );
      const entry = next.participants.find((p) => p.playerIds.includes(command.playerId))!;
      expect(standings(season, matches).find((r) => r.participantId === entry.id)).toMatchObject({
        played: 0,
        won: 0,
        lost: 0,
      });
      expect(standings(season, matches).reduce((total, r) => total + r.won, 0)).toBe(1);
      expect(() => executeCommand(next, command)).toThrow('already');
      const existingOtherEntry = state.players[count];
      const again = executeCommand(next, { ...command, playerId: existingOtherEntry.id });
      expect(
        again.participants.filter(
          (p) => p.kind === 'individual' && p.playerIds[0] === existingOtherEntry.id,
        ),
      ).toHaveLength(1);
      expect(again.fixtures.length - next.fixtures.length).toBe(count + 1);
    },
  );

  it('denies ordinary players, inactive/duplicate accounts and closed seasons', () => {
    const { state, command } = setup();
    const playerState = structuredClone(state);
    playerState.currentUserId = state.players[1].id;
    expect(() => executeCommand(playerState, command)).toThrow('Administrator');
    for (const status of ['draft', 'playoffs', 'complete'] as const) {
      const closed = structuredClone(state);
      closed.seasons.find((s) => s.id === command.seasonId)!.status = status;
      expect(() => executeCommand(closed, command)).toThrow('unfinalized');
    }
    const inactive = structuredClone(state);
    inactive.players.find((p) => p.id === command.playerId)!.active = false;
    expect(() => executeCommand(inactive, command)).toThrow('active');
    expect(() => executeCommand(state, { ...command, playerId: state.players[0].id })).toThrow(
      'already',
    );
    expect(() =>
      executeCommand(state, { ...command, dueDate: addDays(weekStart(dateOnly()), -7) }),
    ).toThrow('current week');
  });

  it('ignores archived leave for new catch-up deadlines', () => {
    const { state, command } = setup();
    state.availability.push({
      id: 'late-leave',
      playerId: command.playerId,
      from: command.dueDate,
      to: addDays(command.dueDate, 2),
      reason: 'Annual leave',
    });
    const next = executeCommand(state, command);
    expect(
      next.fixtures
        .slice(state.fixtures.length)
        .every((f) => f.dueDate >= weekStart(command.dueDate)),
    ).toBe(true);
  });
});
