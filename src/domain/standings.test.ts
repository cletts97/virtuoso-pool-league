import { describe, expect, it } from 'vitest';
import { generateRoundRobin, qualificationTie, qualifiedIds, standings } from './rules';
import type { Fixture, Score, Season } from './types';

const season: Season = {
  id: 'league',
  name: 'League',
  startDate: '2026-10-01',
  participantIds: ['a', 'b', 'c', 'd', 'e'],
  format: 'singles',
  status: 'regular',
  config: { roundsPerWeek: 2 },
  qualifiers: [],
};
function match(homeId: string, awayId: string, score: Score): Fixture {
  return {
    id: `${homeId}-${awayId}`,
    seasonId: season.id,
    homeId,
    awayId,
    round: 1,
    dueDate: season.startDate,
    stage: 'regular',
    bestOf: 3,
    status: 'confirmed',
    score,
    history: [],
  };
}
describe('win-based ranking', () => {
  it('counts 2–0 and 2–1 equally as wins, with different frame differences', () => {
    const rows = standings(season, [
      match('a', 'c', { home: 2, away: 1 }),
      match('b', 'd', { home: 2, away: 0 }),
    ]);
    expect(rows.slice(0, 2).map((r) => [r.participantId, r.won, r.difference])).toEqual([
      ['b', 1, 2],
      ['a', 1, 1],
    ]);
    expect(rows.every((r) => !('points' in r))).toBe(true);
  });
  it('ranks wins before win percentage or matches played', () => {
    const rows = standings(season, [
      match('a', 'c', { home: 2, away: 0 }),
      match('b', 'c', { home: 2, away: 1 }),
      match('b', 'd', { home: 2, away: 1 }),
      match('e', 'b', { home: 2, away: 0 }),
    ]);
    expect(rows[0]).toMatchObject({
      participantId: 'b',
      played: 3,
      won: 2,
      lost: 1,
      winPercentage: 67,
    });
    expect(rows.find((r) => r.participantId === 'a')?.winPercentage).toBe(100);
  });
  it('uses frames won after equal wins and frame difference', () => {
    const rows = standings(season, [
      match('a', 'c', { home: 2, away: 1 }),
      match('b', 'd', { home: 2, away: 0 }),
      match('e', 'b', { home: 2, away: 1 }),
    ]);
    expect(
      rows.filter((r) => ['a', 'b'].includes(r.participantId)).map((r) => r.participantId),
    ).toEqual(['b', 'a']);
  });
  it('uses the direct result for exactly two equal records, regardless of input order', () => {
    const fixtures = [
      match('b', 'a', { home: 2, away: 1 }),
      match('a', 'c', { home: 2, away: 1 }),
      match('d', 'b', { home: 2, away: 1 }),
    ];
    const rows = standings(season, fixtures);
    expect(
      rows.filter((r) => ['a', 'b'].includes(r.participantId)).map((r) => r.participantId),
    ).toEqual(['b', 'a']);
    expect(rows.find((r) => r.participantId === 'a')?.unresolvedTie).toBeUndefined();
    expect(
      standings(
        { ...season, participantIds: [...season.participantIds].reverse() },
        [...fixtures].reverse(),
      ),
    ).toEqual(rows);
  });
  it.each(['pending', 'disputed', 'postponed', 'scheduled', 'cancelled'] as const)(
    'does not use a %s head-to-head result',
    (status) => {
      const fixtures = [
        match('a', 'c', { home: 2, away: 1 }),
        match('b', 'd', { home: 2, away: 1 }),
        { ...match('b', 'a', { home: 2, away: 0 }), status },
      ];
      expect(
        standings(season, fixtures)
          .slice(0, 2)
          .map((r) => r.participantId),
      ).toEqual(['a', 'b']);
      expect(standings(season, fixtures)[0].unresolvedTie).toEqual(['a', 'b']);
    },
  );
  it('ignores playoff, other-season, and invalid scores for head-to-head', () => {
    const base = [match('a', 'c', { home: 2, away: 1 }), match('b', 'd', { home: 2, away: 1 })];
    const extra = [
      { ...match('b', 'a', { home: 3, away: 1 }), stage: 'semifinal' as const, bestOf: 5 as const },
      { ...match('b', 'a', { home: 2, away: 1 }), seasonId: 'old' },
      match('b', 'a', { home: 2, away: 2 }),
    ];
    expect(standings(season, [...base, ...extra])).toEqual(standings(season, base));
  });
  it('uses a stable display fallback for cyclic multi-player ties', () => {
    const fixtures = [
      match('a', 'b', { home: 2, away: 1 }),
      match('b', 'c', { home: 2, away: 1 }),
      match('c', 'a', { home: 2, away: 1 }),
    ];
    const rows = standings(season, fixtures);
    expect(rows.slice(0, 3).map((r) => r.participantId)).toEqual(['a', 'b', 'c']);
    expect(rows[0].unresolvedTie).toEqual(['a', 'b', 'c']);
    expect(standings(season, [...fixtures].reverse())).toEqual(rows);
  });
  it('blocks a fully played five-way cutoff tie even with administrator finalization', () => {
    const fixtures = generateRoundRobin(season).map((f) => {
      const delta =
        (season.participantIds.indexOf(f.homeId) - season.participantIds.indexOf(f.awayId) + 5) % 5;
      return {
        ...f,
        status: 'confirmed' as const,
        score: delta <= 2 ? { home: 2, away: 1 } : { home: 1, away: 2 },
      };
    });
    expect(qualificationTie(season, fixtures)).toEqual(season.participantIds);
    expect(() => qualifiedIds(season, fixtures)).toThrow('decider');
    expect(() => qualifiedIds(season, fixtures, true)).toThrow('decider');
  });
  it('does not block qualification for display ties that do not cross the cutoff', () => {
    const four = { ...season, participantIds: ['a', 'b', 'c', 'd'] };
    expect(qualificationTie(four, [])).toEqual([]);
    expect(qualifiedIds(four, [], true)).toEqual(four.participantIds);
  });
});
