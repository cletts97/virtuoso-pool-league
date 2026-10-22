import { describe, expect, it } from 'vitest';
import {
  addDays,
  canApprove,
  generateRoundRobin,
  matchStatus,
  qualifiedIds,
  standings,
  validScore,
} from './rules';
import type { Fixture, Season } from './types';
import { createSeed } from '../data/seed';

function makeSeason(count: number): Season {
  return {
    id: 'test',
    name: 'Test League',
    startDate: '2026-10-01',
    participantIds: Array.from({ length: count }, (_, i) => `p${i}`),
    format: 'singles',
    status: 'regular',
    config: { roundsPerWeek: 2 },
    qualifiers: [],
  };
}
describe('round-robin generation', () => {
  it.each([2, 3, 4, 5, 10, 11, 12, 13, 14])(
    'schedules %i players exactly once per pairing, with no round conflicts',
    (count) => {
      const season = makeSeason(count),
        fixtures = generateRoundRobin(season);
      expect(fixtures).toHaveLength((count * (count - 1)) / 2);
      expect(new Set(fixtures.map((f) => [f.homeId, f.awayId].sort().join('/'))).size).toBe(
        fixtures.length,
      );
      const rounds = [...new Set(fixtures.map((f) => f.round))];
      expect(rounds).toHaveLength(count % 2 ? count : count - 1);
      for (const round of rounds) {
        const players = fixtures
          .filter((f) => f.round === round)
          .flatMap((f) => [f.homeId, f.awayId]);
        expect(new Set(players).size).toBe(players.length);
        expect(players).toHaveLength(count % 2 ? count - 1 : count);
      }
      for (const participant of season.participantIds)
        expect(fixtures.filter((f) => [f.homeId, f.awayId].includes(participant))).toHaveLength(
          count - 1,
        );
    },
  );
  it('targets two rounds a week without specifying match times', () => {
    const f = generateRoundRobin(makeSeason(12));
    expect(f.find((x) => x.round === 1)?.dueDate).toBe('2026-10-04');
    expect(f.find((x) => x.round === 2)?.dueDate).toBe('2026-10-07');
    expect(f.find((x) => x.round === 3)?.dueDate).toBe('2026-10-11');
  });
  it('rejects duplicate entries and invalid dates', () => {
    expect(() =>
      generateRoundRobin({ ...makeSeason(4), participantIds: ['a', 'a', 'b', 'c'] }),
    ).toThrow('unique');
    expect(() => generateRoundRobin({ ...makeSeason(4), startDate: '2026-02-30' })).toThrow('date');
  });
  it('does date arithmetic across month boundaries', () =>
    expect(addDays('2026-12-30', 4)).toBe('2027-01-03'));
});
describe('completed score validation', () => {
  it.each([3, 5, 7])('accepts only a completed best-of-%i match', (bestOf) => {
    const target = Math.ceil(bestOf / 2);
    for (let home = -1; home <= target + 1; home++)
      for (let away = -1; away <= target + 1; away++) {
        expect(validScore({ home, away }, bestOf)).toBe(
          (home === target && away >= 0 && away < target) ||
            (away === target && home >= 0 && home < target),
        );
      }
    expect(validScore({ home: target, away: 0.5 }, bestOf)).toBe(false);
    expect(validScore({ home: NaN, away: target }, bestOf)).toBe(false);
  });
});
describe('standings', () => {
  it('counts only approved regular-season results once', () => {
    const season = makeSeason(4);
    const base = generateRoundRobin(season)[0];
    const confirmed: Fixture = { ...base, status: 'confirmed', score: { home: 2, away: 1 } };
    const ignored = ['pending', 'disputed', 'postponed', 'cancelled'].map(
      (status, i) => ({ ...confirmed, id: `ignored-${i}`, status }) as Fixture,
    );
    const rows = standings(season, [
      confirmed,
      confirmed,
      ...ignored,
      { ...confirmed, id: 'sf', stage: 'semifinal' },
      { ...confirmed, id: 'other', seasonId: 'other' },
    ]);
    expect(rows[0]).toMatchObject({
      participantId: confirmed.homeId,
      played: 1,
      won: 1,
      lost: 0,
      framesWon: 2,
      framesLost: 1,
      difference: 1,
      winPercentage: 100,
    });
    expect(rows.reduce((sum, r) => sum + r.played, 0)).toBe(2);
    expect(rows.reduce((sum, r) => sum + r.difference, 0)).toBe(0);
  });
  it('deterministically ranks tied records regardless of input order', () => {
    const season = makeSeason(4);
    expect(standings(season, []).map((r) => r.participantId)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(
      standings({ ...season, participantIds: [...season.participantIds].reverse() }, []),
    ).toEqual(standings(season, []));
  });
  it('uses frame difference before frames won, then stable ID', () => {
    const season = makeSeason(4);
    const fixtures = generateRoundRobin(season).map((f) => ({
      ...f,
      status: 'confirmed' as const,
      score: { home: 2, away: f.homeId === 'p0' ? 0 : 1 },
    }));
    const rows = standings(season, fixtures);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1],
        b = rows[i];
      expect(
        a.won > b.won ||
          (a.won === b.won &&
            (a.difference > b.difference ||
              (a.difference === b.difference &&
                (a.framesWon > b.framesWon ||
                  (a.framesWon === b.framesWon && a.participantId < b.participantId))))),
      ).toBe(true);
    }
  });
});
describe('approval, qualification and status', () => {
  it('requires the opposing side, including future doubles teams', () => {
    const f = {
      ...generateRoundRobin(makeSeason(4))[0],
      homeId: 'a',
      awayId: 'b',
      status: 'pending',
      submittedBy: 'alice',
    } as Fixture;
    const entries = [
      { id: 'a', name: 'A', kind: 'team' as const, playerIds: ['alice', 'amy'] },
      { id: 'b', name: 'B', kind: 'team' as const, playerIds: ['bob', 'ben'] },
    ];
    expect(canApprove(f, 'alice', entries)).toBe(false);
    expect(canApprove(f, 'amy', entries)).toBe(false);
    expect(canApprove(f, 'bob', entries)).toBe(true);
    expect(canApprove(f, 'unrelated-admin', entries)).toBe(false);
  });
  it('does not qualify an unfinished season without explicit override', () => {
    const state = createSeed('2026-10-19'),
      season = state.seasons[0];
    expect(() => qualifiedIds(season, state.fixtures)).toThrow('Complete');
    expect(qualifiedIds(season, state.fixtures, true)).toEqual(
      standings(season, state.fixtures)
        .slice(0, 4)
        .map((r) => r.participantId),
    );
    const old = state.seasons[1];
    expect(qualifiedIds(old, state.fixtures)).toEqual(old.qualifiers);
  });
  it('shows overdue scheduled/postponed matches without changing their result or stored status', () => {
    const fixture = generateRoundRobin(makeSeason(4))[0];
    expect(matchStatus(fixture, '2026-12-01')).toBe('overdue');
    const postponed = { ...fixture, status: 'postponed' as const };
    expect(matchStatus(postponed, '2026-12-01')).toBe('overdue');
    expect(postponed.status).toBe('postponed');
    expect(postponed.score).toBeUndefined();
    expect(matchStatus(postponed, fixture.dueDate)).toBe('postponed');
    expect(matchStatus(fixture, fixture.dueDate)).toBe('scheduled');
  });
});
