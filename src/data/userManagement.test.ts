import { describe, it, expect } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';
describe('user management', () => {
  it('allows blank departments and preserves history when deleting another account', () => {
    const source = createSeed();
    const edited = executeCommand(source, {
      type: 'savePlayer',
      id: 'p02',
      name: 'Updated',
      department: '',
      active: true,
    });
    expect(edited.players.find((p) => p.id === 'p02')!.department).toBe('');
    const deleted = executeCommand(edited, { type: 'deleteUser', id: 'p02' });
    expect(deleted.players.find((p) => p.id === 'p02')).toMatchObject({
      name: 'Deleted user',
      active: false,
      deleted: true,
      department: '',
    });
    expect(deleted.fixtures).toEqual(source.fixtures);
    expect(deleted.participants.find((p) => p.playerIds.includes('p02'))!.name).toBe(
      'Deleted user',
    );
    expect(() =>
      executeCommand(deleted, {
        type: 'savePlayer',
        id: 'p02',
        name: 'Restore',
        department: '',
        active: true,
      }),
    ).toThrow('Deleted accounts');
  });
  it('rejects self-deletion and non-admin deletion', () => {
    const state = createSeed();
    expect(() => executeCommand(state, { type: 'deleteUser', id: state.currentUserId })).toThrow(
      'own account',
    );
    state.currentUserId = 'p02';
    expect(() => executeCommand(state, { type: 'deleteUser', id: 'p03' })).toThrow('Administrator');
  });
});
