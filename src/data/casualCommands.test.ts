import { describe, expect, it } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';
import { casualHeadToHead } from '../domain/casual';
import { standings } from '../domain/rules';
import { publicSnapshot } from './publicSnapshot';
import { LocalLeagueRepository } from './localRepository';
import type { LeagueState } from '../domain/types';

function setup(doubles = false) {
  const state = createSeed();
  state.currentUserId = 'p02';
  return {
    state,
    command: {
      type: 'submitCasual' as const,
      result: {
        id: crypto.randomUUID(),
        homePlayerIds: doubles ? ['p02', 'p03'] : ['p02'],
        awayPlayerIds: doubles ? ['p04', 'p05'] : ['p04'],
        playedOn: '2026-01-01',
        bestOf: 3 as const,
        score: { home: 2, away: 1 },
      },
    },
  };
}
const as = (state: LeagueState, id: string) => ({ ...state, currentUserId: id });
describe('casual games', () => {
  it('requires opposing approval, counts once, and never changes league standings', () => {
    const { state, command } = setup();
    const original = standings(state.seasons[0], state.fixtures);
    const pending = executeCommand(state, command);
    expect(casualHeadToHead(pending.casualResults!, ['p02'], ['p04']).played).toBe(0);
    expect(() =>
      executeCommand(pending, {
        type: 'reviewCasual',
        id: command.result.id,
        approve: true,
        reason: '',
      }),
    ).toThrow('opposing');
    expect(() =>
      executeCommand(as(pending, 'p03'), {
        type: 'reviewCasual',
        id: command.result.id,
        approve: true,
        reason: '',
      }),
    ).toThrow('opposing');
    const confirmed = executeCommand(as(pending, 'p04'), {
      type: 'reviewCasual',
      id: command.result.id,
      approve: true,
      reason: '',
    });
    expect(casualHeadToHead(confirmed.casualResults!, ['p02'], ['p04'])).toEqual({
      played: 1,
      won: 1,
      lost: 0,
      framesFor: 2,
      framesAgainst: 1,
    });
    expect(casualHeadToHead(confirmed.casualResults!, ['p04'], ['p02']).won).toBe(0);
    expect(() =>
      executeCommand(confirmed, {
        type: 'reviewCasual',
        id: command.result.id,
        approve: true,
        reason: '',
      }),
    ).toThrow();
    expect(standings(confirmed.seasons[0], confirmed.fixtures)).toEqual(original);
  });
  it('compares exact doubles teams, independently of member and side order', () => {
    const { state, command } = setup(true);
    let next = executeCommand(state, command);
    expect(() =>
      executeCommand(as(next, 'p03'), {
        type: 'reviewCasual',
        id: command.result.id,
        approve: true,
        reason: '',
      }),
    ).toThrow('opposing');
    next = executeCommand(as(next, 'p05'), {
      type: 'reviewCasual',
      id: command.result.id,
      approve: true,
      reason: '',
    });
    expect(casualHeadToHead(next.casualResults!, ['p03', 'p02'], ['p05', 'p04']).won).toBe(1);
    expect(casualHeadToHead(next.casualResults!, ['p05', 'p04'], ['p03', 'p02']).lost).toBe(1);
    expect(casualHeadToHead(next.casualResults!, ['p02'], ['p04']).played).toBe(0);
  });
  it('preserves dispute, resubmission, correction and void history', () => {
    const { state, command } = setup();
    let next = executeCommand(state, command);
    next = executeCommand(as(next, 'p04'), {
      type: 'reviewCasual',
      id: command.result.id,
      approve: false,
      reason: 'Wrong score',
    });
    next = executeCommand(as(next, 'p02'), {
      ...command,
      result: { ...command.result, score: { home: 1, away: 2 } },
    });
    expect(next.casualResults![0].status).toBe('pending');
    expect(() =>
      executeCommand(next, {
        type: 'resolveCasual',
        id: command.result.id,
        score: { home: 2, away: 0 },
        reason: 'Checked',
      }),
    ).toThrow('Administrator');
    next = executeCommand(as(next, 'p01'), {
      type: 'resolveCasual',
      id: command.result.id,
      score: { home: 2, away: 0 },
      reason: 'Checked with players',
    });
    next = executeCommand(next, {
      type: 'voidCasual',
      id: command.result.id,
      reason: 'Duplicate record',
    });
    expect(next.casualResults![0].history.map((h) => h.action)).toEqual([
      'submitted',
      'disputed',
      'submitted',
      'corrected',
      'cancelled',
    ]);
    expect(casualHeadToHead(next.casualResults!, ['p02'], ['p04']).played).toBe(0);
    expect(() =>
      executeCommand(next, {
        type: 'resolveCasual',
        id: command.result.id,
        score: { home: 2, away: 0 },
        reason: 'Restore',
      }),
    ).toThrow('voided');
  });
  it('rejects invalid teams, inactive/nonparticipants, scores, future dates and duplicate IDs', () => {
    const { state, command } = setup();
    for (const patch of [
      { awayPlayerIds: ['p02'] },
      { homePlayerIds: ['p02', 'p03'] },
      { score: { home: 1, away: 1 } },
      { score: { home: 2, away: 2 } },
      { playedOn: '2999-01-01' },
    ])
      expect(() =>
        executeCommand(state, { ...command, result: { ...command.result, ...patch } }),
      ).toThrow();
    expect(() => executeCommand(as(state, 'p03'), command)).toThrow('played');
    state.players.find((p) => p.id === 'p04')!.active = false;
    expect(() => executeCommand(state, command)).toThrow('active');
    state.players.find((p) => p.id === 'p04')!.active = true;
    expect(() => executeCommand(executeCommand(state, command), command)).toThrow('already');
    expect(() => executeCommand({ ...state, readOnly: true }, command)).toThrow('active');
    expect(() => executeCommand({ ...state, casualResultsEnabled: false }, command)).toThrow(
      'not available',
    );
  });
  it('allows one-frame games and casual accounts without any season entry', () => {
    const { state, command } = setup();
    state.currentUserId = 'colleague-01';
    state.seasons = [];
    state.participants = [];
    const next = executeCommand(state, {
      ...command,
      result: {
        ...command.result,
        homePlayerIds: ['colleague-01'],
        bestOf: 1,
        score: { home: 1, away: 0 },
      },
    });
    expect(next.casualResults![0].status).toBe('pending');
  });
  it('publishes only confirmed records without audit identity or notes', () => {
    const { state, command } = setup();
    const pending = executeCommand(state, command);
    expect(publicSnapshot(pending).casualResults).toEqual([]);
    const confirmed = executeCommand(as(pending, 'p04'), {
      type: 'reviewCasual',
      id: command.result.id,
      approve: true,
      reason: '',
    });
    const visible = publicSnapshot(confirmed).casualResults![0];
    expect(visible.history).toEqual([]);
    expect(visible.submittedBy).toBeUndefined();
    expect(visible.score).toEqual(command.result.score);
  });
  it('persists demo casual results over repository reloads', async () => {
    const values = new Map<string, string>();
    const repo = new LocalLeagueRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    });
    await repo.load();
    await repo.preferences({ currentUserId: 'p02' });
    const { command } = setup();
    await repo.execute(command);
    expect((await repo.load()).casualResults![0].id).toBe(command.result.id);
  });
});
