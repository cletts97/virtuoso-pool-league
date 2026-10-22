import { describe, expect, it } from 'vitest';
import { executeCommand } from './commands';
import { createSeed } from './seed';
import { canApprove, standings, winner } from '../domain/rules';
import { LocalLeagueRepository, STORAGE_KEY } from './localRepository';
import type { LeagueState } from '../domain/types';

function scenario() {
  const state = createSeed('2026-10-19');
  const fixture = state.fixtures.find(
    (f) => f.seasonId === state.seasons[0].id && f.status === 'scheduled',
  )!;
  const homeUser = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
  const awayUser = state.participants.find((p) => p.id === fixture.awayId)!.playerIds[0];
  state.currentUserId = homeUser;
  return { state, fixture, homeUser, awayUser };
}
describe('result lifecycle', () => {
  it('submits, prevents self approval, notifies the opponent, and confirms once', () => {
    const { state, fixture, homeUser, awayUser } = scenario();
    const before = standings(state.seasons[0], state.fixtures);
    const pending = executeCommand(state, {
      type: 'submit',
      fixtureId: fixture.id,
      score: { home: 2, away: 1 },
    });
    expect(standings(pending.seasons[0], pending.fixtures)).toEqual(before);
    expect(state.fixtures.find((f) => f.id === fixture.id)?.status).toBe('scheduled');
    expect(
      pending.notifications.some(
        (n) => n.userId === awayUser && n.fixtureId === fixture.id && n.kind === 'approval',
      ),
    ).toBe(true);
    expect(() =>
      executeCommand(pending, { type: 'review', fixtureId: fixture.id, approve: true, reason: '' }),
    ).toThrow('opposing');
    expect(() =>
      executeCommand(pending, {
        type: 'submit',
        fixtureId: fixture.id,
        score: { home: 2, away: 0 },
      }),
    ).toThrow('already');
    pending.currentUserId = awayUser;
    const approved = executeCommand(pending, {
      type: 'review',
      fixtureId: fixture.id,
      approve: true,
      reason: '',
    });
    expect(
      standings(approved.seasons[0], approved.fixtures).find(
        (r) => r.participantId === fixture.homeId,
      )?.won,
    ).toBe(before.find((r) => r.participantId === fixture.homeId)!.won + 1);
    expect(
      approved.fixtures.find((f) => f.id === fixture.id)?.history.map((h) => h.actorId),
    ).toEqual([homeUser, awayUser]);
    expect(() =>
      executeCommand(approved, {
        type: 'review',
        fixtureId: fixture.id,
        approve: true,
        reason: '',
      }),
    ).toThrow('opposing');
  });
  it('rejects invalid scores and nonparticipants', () => {
    const { state, fixture } = scenario();
    expect(() =>
      executeCommand(state, { type: 'submit', fixtureId: fixture.id, score: { home: 2, away: 2 } }),
    ).toThrow('valid');
    state.currentUserId = state.players.find(
      (p) =>
        !state.participants
          .filter((e) => [fixture.homeId, fixture.awayId].includes(e.id))
          .flatMap((e) => e.playerIds)
          .includes(p.id),
    )!.id;
    expect(() =>
      executeCommand(state, { type: 'submit', fixtureId: fixture.id, score: { home: 2, away: 1 } }),
    ).toThrow('participant');
  });
  it('disputes a pending result and preserves original scores when an administrator resolves and corrects it', () => {
    const { state, fixture, awayUser } = scenario();
    let result = executeCommand(state, {
      type: 'submit',
      fixtureId: fixture.id,
      score: { home: 2, away: 0 },
    });
    result.currentUserId = awayUser;
    expect(() =>
      executeCommand(result, {
        type: 'review',
        fixtureId: fixture.id,
        approve: false,
        reason: ' ',
      }),
    ).toThrow('reason');
    result = executeCommand(result, {
      type: 'review',
      fixtureId: fixture.id,
      approve: false,
      reason: 'Score reversed',
    });
    expect(result.fixtures.find((f) => f.id === fixture.id)?.status).toBe('disputed');
    result.currentUserId = 'p01';
    result = executeCommand(result, {
      type: 'correct',
      fixtureId: fixture.id,
      score: { home: 0, away: 2 },
      reason: 'Checked with both players',
    });
    result = executeCommand(result, {
      type: 'correct',
      fixtureId: fixture.id,
      score: { home: 1, away: 2 },
      reason: 'Corrected the frame total',
    });
    const match = result.fixtures.find((f) => f.id === fixture.id)!;
    expect(match.history).toHaveLength(4);
    expect(match.history[0].score).toEqual({ home: 2, away: 0 });
    expect(match.history[2].score).toEqual({ home: 0, away: 2 });
    expect(match.status).toBe('confirmed');
  });
  it('postpones and reschedules without awarding wins or losses; still allows an early result', () => {
    const { state, fixture } = scenario();
    const before = standings(state.seasons[0], state.fixtures);
    let result = executeCommand(state, {
      type: 'postpone',
      fixtureId: fixture.id,
      dueDate: '2026-11-15',
      reason: 'Annual leave',
    });
    expect(standings(result.seasons[0], result.fixtures)).toEqual(before);
    expect(result.fixtures.find((f) => f.id === fixture.id)?.status).toBe('postponed');
    result.currentUserId = 'p01';
    result = executeCommand(result, {
      type: 'reschedule',
      fixtureId: fixture.id,
      dueDate: '2026-11-16',
      reason: 'Agreed catch-up date',
    });
    result.currentUserId = state.currentUserId;
    result = executeCommand(result, {
      type: 'submit',
      fixtureId: fixture.id,
      score: { home: 2, away: 1 },
    });
    expect(result.fixtures.find((f) => f.id === fixture.id)?.status).toBe('pending');
    expect(() =>
      executeCommand(result, {
        type: 'postpone',
        fixtureId: fixture.id,
        dueDate: '2026-11-20',
        reason: 'Move it',
      }),
    ).toThrow('submitted');
  });
});
describe('administration and playoffs', () => {
  it('enforces admin authorization on all management commands', () => {
    const state = createSeed('2026-10-19');
    state.currentUserId = 'p02';
    expect(() =>
      executeCommand(state, { type: 'generate', seasonId: state.seasons[0].id }),
    ).toThrow('Administrator');
    expect(() =>
      executeCommand(state, { type: 'finalize', seasonId: state.seasons[0].id, reason: 'Close' }),
    ).toThrow('Administrator');
    expect(() =>
      executeCommand(state, {
        type: 'savePlayer',
        name: 'New Player',
        department: 'IT',
        active: true,
      }),
    ).toThrow('Administrator');
  });
  it('creates a draft season and generates a unique odd-player schedule once', () => {
    let state = createSeed('2026-10-19');
    state = executeCommand(state, {
      type: 'createSeason',
      name: 'Winter',
      startDate: '2027-01-04',
      participantIds: state.participants.slice(0, 11).map((p) => p.id),
      roundsPerWeek: 2,
    });
    const seasonId = state.selectedSeasonId;
    expect(state.seasons[0].status).toBe('draft');
    state = executeCommand(state, { type: 'generate', seasonId });
    expect(state.fixtures.filter((f) => f.seasonId === seasonId)).toHaveLength(55);
    expect(() => executeCommand(state, { type: 'generate', seasonId })).toThrow('draft');
  });
  it('ignores archived leave when generating new fixtures', () => {
    let state = createSeed('2026-10-19');
    state.availability.push({
      id: 'archived',
      playerId: 'p01',
      from: '2027-01-01',
      to: '2027-01-31',
      reason: 'Archived',
    });
    state = executeCommand(state, {
      type: 'createSeason',
      name: 'Leave-aware',
      startDate: '2027-01-01',
      participantIds: state.participants.slice(0, 4).map((p) => p.id),
      roundsPerWeek: 2,
    });
    state = executeCommand(state, { type: 'generate', seasonId: state.selectedSeasonId });
    const fixtures = state.fixtures.filter(
      (f) => f.seasonId === state.selectedSeasonId && [f.homeId, f.awayId].includes('entry-p01'),
    );
    expect(fixtures.every((f) => f.status === 'scheduled' && f.dueDate < '2027-02-01')).toBe(true);
    expect(
      standings(state.seasons[0], state.fixtures).every((r) => r.won === 0 && r.lost === 0),
    ).toBe(true);
  });
  it('explicitly finalizes, closes outstanding fixtures without wins or losses, and derives seeds from standings', () => {
    const source = createSeed('2026-10-19');
    const table = standings(source.seasons[0], source.fixtures);
    const state = executeCommand(source, {
      type: 'finalize',
      seasonId: source.seasons[0].id,
      reason: 'Catch-up deadline agreed by the league',
    });
    expect(state.seasons[0].qualifiers).toEqual(table.slice(0, 4).map((r) => r.participantId));
    expect(standings(state.seasons[0], state.fixtures)).toEqual(table);
    const semis = state.fixtures.filter(
      (f) => f.seasonId === source.seasons[0].id && f.stage === 'semifinal',
    );
    expect(semis.map((f) => [f.homeId, f.awayId])).toEqual([
      [table[0].participantId, table[3].participantId],
      [table[1].participantId, table[2].participantId],
    ]);
    expect(semis.every((f) => f.bestOf === 5)).toBe(true);
    expect(() =>
      executeCommand(state, { type: 'finalize', seasonId: state.seasons[0].id, reason: 'Again' }),
    ).toThrow('regular');
  });
  it('runs the entire playoff approval lifecycle, creates a single final and crowns its winner', () => {
    let state = createSeed('2026-10-19');
    state = executeCommand(state, {
      type: 'finalize',
      seasonId: state.seasons[0].id,
      reason: 'Start playoffs',
    });
    const seasonId = state.seasons[0].id;
    function play(current: LeagueState, fixtureId: string, target: number) {
      const fixture = current.fixtures.find((f) => f.id === fixtureId)!;
      current.currentUserId = current.participants.find(
        (p) => p.id === fixture.homeId,
      )!.playerIds[0];
      let next = executeCommand(current, {
        type: 'submit',
        fixtureId,
        score: { home: target, away: 1 },
      });
      const pending = next.fixtures.find((f) => f.id === fixtureId)!;
      next.currentUserId = next.players.find((p) =>
        canApprove(pending, p.id, next.participants),
      )!.id;
      next = executeCommand(next, { type: 'review', fixtureId, approve: true, reason: '' });
      return next;
    }
    for (const semi of state.fixtures.filter(
      (f) => f.seasonId === seasonId && f.stage === 'semifinal',
    ))
      state = play(state, semi.id, 3);
    const finals = state.fixtures.filter((f) => f.seasonId === seasonId && f.stage === 'final');
    expect(finals).toHaveLength(1);
    expect(finals[0].bestOf).toBe(7);
    state = play(state, finals[0].id, 4);
    expect(state.seasons[0].status).toBe('complete');
    expect(state.seasons[0].championId).toBe(
      winner(state.fixtures.find((f) => f.id === finals[0].id)!),
    );
    state.currentUserId = 'p01';
    const semi = state.fixtures.find((f) => f.seasonId === seasonId && f.stage === 'semifinal')!;
    expect(() =>
      executeCommand(state, {
        type: 'correct',
        fixtureId: semi.id,
        score: { home: 1, away: 3 },
        reason: 'Reverse semifinal',
      }),
    ).toThrow('final has started');
  });
  it('automatically starts playoffs after the last regular-season result is approved', () => {
    const state = createSeed('2026-10-19');
    const season = state.seasons[0];
    const matches = state.fixtures.filter((f) => f.seasonId === season.id && f.stage === 'regular');
    matches.forEach((f) => {
      f.status = 'confirmed';
      f.score = { home: 2, away: 1 };
    });
    const last = matches.at(-1)!;
    last.status = 'pending';
    last.submittedBy = state.participants.find((p) => p.id === last.homeId)!.playerIds[0];
    state.currentUserId = state.participants.find((p) => p.id === last.awayId)!.playerIds[0];
    const next = executeCommand(state, {
      type: 'review',
      fixtureId: last.id,
      approve: true,
      reason: '',
    });
    expect(next.seasons[0].status).toBe('playoffs');
    expect(
      next.fixtures.filter((f) => f.seasonId === season.id && f.stage === 'semifinal'),
    ).toHaveLength(2);
  });
  it('deactivates without deleting history and prevents current admin deactivation', () => {
    const state = createSeed('2026-10-19');
    const player = state.players[1];
    const next = executeCommand(state, { type: 'savePlayer', ...player, active: false });
    expect(next.fixtures).toEqual(state.fixtures);
    expect(next.players[1].active).toBe(false);
    expect(() =>
      executeCommand(state, { type: 'savePlayer', ...state.players[0], active: false }),
    ).toThrow('current administrator');
  });
});
describe('edge cases and notifications', () => {
  it('persists the last approval but holds playoff seeding when the cutoff is tied', () => {
    let state = createSeed('2026-10-19');
    const ids = state.participants.slice(0, 5).map((p) => p.id);
    state = executeCommand(state, {
      type: 'createSeason',
      name: 'Tied finish',
      startDate: '2027-01-01',
      participantIds: ids,
      roundsPerWeek: 2,
    });
    const seasonId = state.selectedSeasonId;
    state = executeCommand(state, { type: 'generate', seasonId });
    const fixtures = state.fixtures.filter((f) => f.seasonId === seasonId);
    fixtures.forEach((f) => {
      f.status = 'confirmed';
      f.score =
        (ids.indexOf(f.homeId) - ids.indexOf(f.awayId) + 5) % 5 <= 2
          ? { home: 2, away: 1 }
          : { home: 1, away: 2 };
    });
    const last = fixtures.at(-1)!;
    last.status = 'pending';
    last.submittedBy = state.participants.find((p) => p.id === last.homeId)!.playerIds[0];
    state.currentUserId = state.participants.find((p) => p.id === last.awayId)!.playerIds[0];
    const next = executeCommand(state, {
      type: 'review',
      fixtureId: last.id,
      approve: true,
      reason: '',
    });
    expect(next.fixtures.find((f) => f.id === last.id)?.status).toBe('confirmed');
    expect(next.seasons[0].status).toBe('regular');
    expect(next.seasons[0].qualifiers).toEqual([]);
    expect(next.fixtures.filter((f) => f.seasonId === seasonId && f.stage !== 'regular')).toEqual(
      [],
    );
    next.currentUserId = 'p01';
    expect(() =>
      executeCommand(next, { type: 'finalize', seasonId, reason: 'Try to force a tie' }),
    ).toThrow('decider');
    expect(next.fixtures.find((f) => f.id === last.id)?.status).toBe('confirmed');
  });
  it('numbers playoffs after all regular rounds for a fourteen-player season', () => {
    let state = createSeed('2026-10-19');
    for (const name of ['Robin Hayes', 'Casey Jordan'])
      state = executeCommand(state, {
        type: 'savePlayer',
        name,
        department: 'Engineering',
        active: true,
      });
    state = executeCommand(state, {
      type: 'createSeason',
      name: 'Fourteen',
      startDate: '2027-01-01',
      participantIds: state.participants.map((p) => p.id),
      roundsPerWeek: 2,
    });
    const seasonId = state.selectedSeasonId;
    state = executeCommand(state, { type: 'generate', seasonId });
    for (const fixture of state.fixtures.filter((f) => f.seasonId === seasonId)) {
      fixture.status = 'confirmed';
      fixture.score = fixture.homeId < fixture.awayId ? { home: 2, away: 0 } : { home: 0, away: 2 };
    }
    state = executeCommand(state, {
      type: 'finalize',
      seasonId,
      reason: 'Explicit test finalization',
    });
    const semis = state.fixtures.filter((f) => f.seasonId === seasonId && f.stage === 'semifinal');
    expect(semis.every((f) => f.round === 14)).toBe(true);
    expect(
      state.fixtures.filter((f) => f.seasonId === seasonId && f.stage === 'regular'),
    ).toHaveLength(91);
  });
  it('rejects retired unavailability commands', () => {
    expect(() =>
      executeCommand(createSeed(), {
        type: 'availability',
        playerId: 'p01',
        from: '2027-01-01',
        to: '2027-01-02',
        reason: 'Leave',
      }),
    ).toThrow('retired');
  });
  it('does not mark another user’s notifications as read', () => {
    const state = createSeed('2026-10-19');
    const next = executeCommand(state, {
      type: 'readNotifications',
      ids: state.notifications.map((n) => n.id),
    });
    expect(next.notifications.filter((n) => n.userId === 'p01').every((n) => n.read)).toBe(true);
    expect(next.notifications.filter((n) => n.userId === 'p02')).toEqual(
      state.notifications.filter((n) => n.userId === 'p02'),
    );
  });
  it('corrects the champion after a final correction while preserving the original result', () => {
    const state = createSeed('2026-10-19');
    const season = state.seasons[1];
    const final = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'final')!;
    const score = final.score!.home === 4 ? { home: 1, away: 4 } : { home: 4, away: 1 };
    const next = executeCommand(state, {
      type: 'correct',
      fixtureId: final.id,
      score,
      reason: 'Verified correction',
    });
    expect(next.seasons[1].championId).not.toBe(season.championId);
    expect(next.fixtures.find((f) => f.id === final.id)!.history[0].score).toEqual(final.score);
  });
});

describe('demo persistence', () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
  }
  it('persists changes through repository reconstruction and resets data', async () => {
    const storage = memory();
    const repository = new LocalLeagueRepository(storage);
    await repository.load();
    await repository.execute({
      type: 'savePlayer',
      name: 'New Player',
      department: 'Service Desk',
      active: true,
    });
    expect((await new LocalLeagueRepository(storage).load()).players).toHaveLength(14);
    expect((await repository.reset()).players).toHaveLength(13);
  });
  it('migrates legacy scoring without losing records, preferences or finalized seeds', async () => {
    const storage = memory();
    const original = createSeed('2026-10-19');
    const legacy = {
      ...original,
      version: 1,
      seasons: original.seasons.map((s) => ({ ...s, config: { ...s.config, pointsPerWin: 3 } })),
      announcements: original.announcements.map((a) => ({
        ...a,
        body: a.body.replace('Every match win counts.', 'Three points for a win.'),
      })),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const repository = new LocalLeagueRepository(storage);
    const next = await repository.load();
    expect(next).toEqual(original);
    expect(storage.getItem(STORAGE_KEY)).not.toContain('pointsPerWin');
    expect(storage.getItem(STORAGE_KEY)).not.toContain('Three points');
    expect(await repository.load()).toEqual(next);
  });
  it('does not overwrite a legacy save when migration cannot be persisted', async () => {
    const raw = JSON.stringify({ ...createSeed('2026-10-19'), version: 1 });
    const storage = {
      getItem: () => raw,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    await expect(new LocalLeagueRepository(storage).load()).rejects.toThrow('not saved');
    expect(storage.getItem()).toBe(raw);
  });
  it('fails explicitly for corrupt data rather than silently overwriting it', async () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, '{broken');
    await expect(new LocalLeagueRepository(storage).load()).rejects.toThrow('could not be read');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
  });
  it('does not claim a successful write when storage is full', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    await expect(new LocalLeagueRepository(storage).load()).rejects.toThrow('not saved');
  });
});
