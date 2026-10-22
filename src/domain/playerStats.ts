import type { LeagueState } from './types';
import { playedDate, validScore } from './rules';

/** Individual league records across published seasons, including playoffs; casual/team records stay separate. */
export function playerLeagueFixtures(state: LeagueState, playerId: string) {
  const entries = new Set(
    state.participants
      .filter(
        (p) => p.kind === 'individual' && p.playerIds.length === 1 && p.playerIds[0] === playerId,
      )
      .map((p) => p.id),
  );
  const seasons = new Map(
    state.seasons
      .filter((s) => s.status !== 'draft' && s.format === 'singles')
      .map((s) => [s.id, s]),
  );
  const seen = new Set<string>();
  return state.fixtures.filter((f) => {
    const season = seasons.get(f.seasonId);
    if (
      seen.has(f.id) ||
      !season ||
      !season.participantIds.includes(f.homeId) ||
      !season.participantIds.includes(f.awayId) ||
      ![f.homeId, f.awayId].some((id) => entries.has(id))
    )
      return false;
    seen.add(f.id);
    return true;
  });
}
export function playerLeagueStats(state: LeagueState, playerId: string) {
  const entries = new Set(
    state.participants
      .filter((p) => p.kind === 'individual' && p.playerIds[0] === playerId)
      .map((p) => p.id),
  );
  let won = 0,
    framesWon = 0,
    framesLost = 0;
  const form: boolean[] = [];
  const fixtures = playerLeagueFixtures(state, playerId)
    .filter((f) => f.status === 'confirmed' && f.score && validScore(f.score, f.bestOf))
    .sort((a, b) => playedDate(a).localeCompare(playedDate(b)) || a.id.localeCompare(b.id));
  for (const f of fixtures) {
    const home = entries.has(f.homeId);
    const own = home ? f.score!.home : f.score!.away;
    const other = home ? f.score!.away : f.score!.home;
    framesWon += own;
    framesLost += other;
    won += Number(own > other);
    form.push(own > other);
  }
  return {
    played: fixtures.length,
    won,
    lost: fixtures.length - won,
    framesWon,
    framesLost,
    difference: framesWon - framesLost,
    winPercentage: fixtures.length ? Math.round((won / fixtures.length) * 100) : 0,
    form,
  };
}
