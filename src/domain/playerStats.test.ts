import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { playerLeagueStats } from './playerStats';
import { publicSnapshot } from '../data/publicSnapshot';

describe('all-season individual player records', () => {
  it('combines separate season entries and playoffs without double-counting or unconfirmed results', () => {
    const state = createSeed('2026-10-22');
    const base = state.fixtures.find((f) => f.homeId === 'entry-p01' || f.awayId === 'entry-p01')!;
    const season = state.seasons.find((s) => s.id === base.seasonId)!;
    state.fixtures = [
      {
        ...base,
        id: 'one',
        homeId: 'entry-p01',
        awayId: 'entry-p02',
        status: 'confirmed',
        score: { home: 2, away: 0 },
      },
    ];
    state.participants.push({
      id: 'new-entry',
      name: 'Alex',
      kind: 'individual',
      playerIds: ['p01'],
    });
    state.seasons.push({
      ...season,
      id: 'later',
      participantIds: ['new-entry', 'entry-p02'],
      status: 'complete',
    });
    const final = {
      ...base,
      id: 'two',
      seasonId: 'later',
      homeId: 'entry-p02',
      awayId: 'new-entry',
      stage: 'final' as const,
      bestOf: 7 as const,
      status: 'confirmed' as const,
      score: { home: 4, away: 3 },
    };
    state.fixtures.push(
      final,
      structuredClone(final),
      { ...final, id: 'pending', status: 'pending' },
      { ...final, id: 'disputed', status: 'disputed' },
      { ...final, id: 'cancelled', status: 'cancelled' },
      { ...final, id: 'invalid', score: { home: 9, away: 0 } },
    );
    expect(playerLeagueStats(state, 'p01')).toMatchObject({
      played: 2,
      won: 1,
      lost: 1,
      framesWon: 5,
      framesLost: 4,
      difference: 1,
      winPercentage: 50,
    });
    state.seasons.find((s) => s.id === 'later')!.status = 'draft';
    expect(playerLeagueStats(state, 'p01').played).toBe(1);
  });
  it('returns zero records without membership and publishes all active users without private fields', () => {
    const state = createSeed('2026-10-22');
    state.players.push({
      id: 'new-user',
      name: 'New User',
      department: 'Private',
      role: 'colleague',
      active: true,
      color: 0,
    });
    state.seasons = [];
    state.fixtures = [];
    state.participants = [];
    expect(playerLeagueStats(state, 'new-user')).toMatchObject({
      played: 0,
      won: 0,
      lost: 0,
      winPercentage: 0,
      form: [],
    });
    const snapshot = publicSnapshot(state);
    expect(snapshot.players.find((p) => p.id === 'new-user')).toMatchObject({
      name: 'New User',
      active: true,
      department: '',
    });
    expect(JSON.stringify(snapshot)).not.toContain('Private');
  });
});
