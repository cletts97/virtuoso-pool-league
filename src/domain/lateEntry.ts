import type { Fixture, Season } from './types';
import { addDays, weekStart } from './rules';

/** Fill spare places without moving a published fixture or exceeding two matches per week. */
export function planAdditionalFixtures(season: Season, fixtures: Fixture[], firstWeek: string) {
  let week = [weekStart(firstWeek), weekStart(season.startDate)].sort().at(-1)!;
  const load = new Map<string, number>();
  const key = (week: string, player: string) => `${week}/${player}`;
  for (const f of fixtures) {
    if (f.seasonId !== season.id || f.stage !== 'regular' || f.status === 'cancelled') continue;
    for (const player of [f.homeId, f.awayId]) {
      const k = key(weekStart(f.dueDate), player);
      load.set(k, (load.get(k) ?? 0) + 1);
    }
  }
  const remaining = new Set(season.participantIds);
  const plan: { opponentId: string; dueDate: string }[] = [];
  while (remaining.size) {
    // Prefer an opponent with only one spare place, then stable ID for reproducibility.
    const available = [...remaining]
      .filter((id) => (load.get(key(week, id)) ?? 0) < 2)
      .sort(
        (a, b) =>
          (load.get(key(week, b)) ?? 0) - (load.get(key(week, a)) ?? 0) || a.localeCompare(b),
      );
    for (const opponentId of available.slice(0, 2)) {
      plan.push({ opponentId, dueDate: week });
      remaining.delete(opponentId);
    }
    week = addDays(week, 7);
  }
  return plan;
}
