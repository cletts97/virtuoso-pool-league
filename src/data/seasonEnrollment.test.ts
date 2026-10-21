import { expect, it } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';

it('creates first-time entries automatically and reuses them in subsequent seasons', () => {
  const state = createSeed();
  const players = state.players.filter((p) => p.active).slice(0, 4);
  state.participants = state.participants.filter(
    (p) => !players.some((u) => p.playerIds.includes(u.id)),
  );
  players[1].role = 'colleague';
  const command = {
    type: 'createSeason' as const,
    name: 'New season',
    startDate: '2026-11-01',
    roundsPerWeek: 2,
    participantIds: players.map((p) => p.id),
  };
  const next = executeCommand(state, command);
  expect(next.seasons[0].participantIds).toHaveLength(4);
  expect(next.players.find((p) => p.id === players[1].id)?.role).toBe('player');
  const again = executeCommand(next, { ...command, name: 'Next season' });
  expect(again.participants).toEqual(next.participants);
  expect(again.seasons[0].participantIds).toEqual(next.seasons[0].participantIds);
  const inactive = structuredClone(state);
  inactive.players.find((p) => p.id === players[1].id)!.active = false;
  expect(() => executeCommand(inactive, command)).toThrow('active individual');
  const duplicate = [...next.seasons[0].participantIds];
  duplicate[1] = players[0].id;
  expect(() => executeCommand(next, { ...command, participantIds: duplicate })).toThrow('unique');
});
