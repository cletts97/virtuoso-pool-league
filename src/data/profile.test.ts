import { describe, expect, it } from 'vitest';
import { executeCommand } from './commands';
import { createSeed } from './seed';
import { commandSchema } from '../../api/src/validation';

describe('own display name', () => {
  it('lets a colleague update only their own name and individual entries', () => {
    const state = createSeed();
    const user = state.players[1];
    user.role = 'colleague';
    state.currentUserId = user.id;
    const next = executeCommand(state, { type: 'updateProfile', name: '  Charlie Letts  ' });
    expect(next.players.find((p) => p.id === user.id)).toEqual({ ...user, name: 'Charlie Letts' });
    expect(next.players.filter((p) => p.id !== user.id)).toEqual(
      state.players.filter((p) => p.id !== user.id),
    );
    expect(
      next.participants
        .filter((p) => p.kind === 'individual' && p.playerIds.includes(user.id))
        .every((p) => p.name === 'Charlie Letts'),
    ).toBe(true);
    expect(state.players[1].name).toBe(user.name);
  });

  it('rejects blank/long names and inactive users', () => {
    const state = createSeed();
    for (const name of ['   ', 'a'.repeat(71)])
      expect(() => executeCommand(state, { type: 'updateProfile', name })).toThrow('Display name');
    state.players.find((p) => p.id === state.currentUserId)!.active = false;
    expect(() => executeCommand(state, { type: 'updateProfile', name: 'Charlie' })).toThrow(
      'active',
    );
  });

  it('rejects requests to select another account or change privileges', () => {
    for (const extra of [{ id: crypto.randomUUID() }, { role: 'admin' }, { active: true }])
      expect(
        commandSchema.safeParse({ type: 'updateProfile', name: 'Charlie', ...extra }).success,
      ).toBe(false);
  });
});
