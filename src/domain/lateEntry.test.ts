import { describe, expect, it } from 'vitest';
import { planAdditionalFixtures } from './lateEntry';
import { addDays, generateRoundRobin, playoffWeek } from './rules';
import type { Fixture, Season } from './types';

function scenario(count: number) {
  const season: Season = {
    id: 'season',
    name: 'Season',
    startDate: '2026-10-26',
    status: 'regular',
    format: 'singles',
    participantIds: Array.from({ length: count }, (_, i) => `p${i}`),
    config: { roundsPerWeek: 2 },
    qualifiers: [],
  };
  return { season, fixtures: generateRoundRobin(season) };
}
function checkCapacity(fixtures: Fixture[], plan: ReturnType<typeof planAdditionalFixtures>) {
  const counts = new Map<string, number>();
  for (const f of [
    ...fixtures,
    ...plan.map((p) => ({ homeId: 'new', awayId: p.opponentId, dueDate: p.dueDate })),
  ]) {
    for (const id of [f.homeId, f.awayId]) {
      const key = `${f.dueDate}/${id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  expect([...counts.values()].every((count) => count <= 2)).toBe(true);
}
describe('additional weekly fixtures', () => {
  it.each([4, 5, 14, 15, 16, 39])(
    'fills spare slots for %i opponents without exceeding two matches',
    (count) => {
      const { season, fixtures } = scenario(count);
      const original = structuredClone(fixtures);
      const plan = planAdditionalFixtures(season, fixtures, season.startDate);
      expect(plan).toHaveLength(count);
      expect(new Set(plan.map((f) => f.opponentId)).size).toBe(count);
      checkCapacity(fixtures, plan);
      expect(fixtures).toEqual(original);
      expect(planAdditionalFixtures(season, fixtures, season.startDate)).toEqual(plan);
      const spare = season.participantIds.filter(
        (id) =>
          fixtures.filter(
            (f) => f.dueDate === season.startDate && [f.homeId, f.awayId].includes(id),
          ).length === 1,
      );
      if (spare.length)
        expect(
          plan
            .filter((f) => f.dueDate === season.startDate)
            .map((f) => f.opponentId)
            .sort(),
        ).toEqual(spare.sort());
    },
  );
  it('extends the schedule for a later join and moves the projected playoff week', () => {
    const { season, fixtures } = scenario(15);
    const firstWeek = addDays(season.startDate, 14);
    const plan = planAdditionalFixtures(season, fixtures, firstWeek);
    expect(plan.every((f) => f.dueDate >= firstWeek)).toBe(true);
    checkCapacity(fixtures, plan);
    const extended = plan.map((p, i) => ({
      ...fixtures[0],
      id: `new-${i}`,
      homeId: 'new',
      awayId: p.opponentId,
      dueDate: p.dueDate,
    }));
    expect(playoffWeek(season, [...fixtures, ...extended]) > playoffWeek(season, fixtures)).toBe(
      true,
    );
  });
  it('ignores cancelled matches and other seasons but counts confirmed and pending scheduled workloads', () => {
    const { season, fixtures } = scenario(4);
    fixtures.forEach((f, i) => {
      f.status = i % 2 ? 'pending' : 'confirmed';
    });
    const blocked = planAdditionalFixtures(season, fixtures, season.startDate);
    expect(blocked.some((f) => f.dueDate === season.startDate)).toBe(false);
    const cancelled = fixtures.map((f) => ({ ...f, status: 'cancelled' as const }));
    const other = fixtures.map((f) => ({ ...f, seasonId: 'other' }));
    expect(
      planAdditionalFixtures(season, [...cancelled, ...other], season.startDate).filter(
        (f) => f.dueDate === season.startDate,
      ),
    ).toHaveLength(2);
    expect(
      planAdditionalFixtures(season, fixtures, '2026-10-19')[0].dueDate >= season.startDate,
    ).toBe(true);
  });
});
