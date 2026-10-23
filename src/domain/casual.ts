import type { CasualResult } from './types';
import { validScore } from './rules';

export const validCasualScore = (score: CasualResult['score'], bestOf: number) =>
  bestOf === 1
    ? (score.home === 1 && score.away === 0) || (score.home === 0 && score.away === 1)
    : validScore(score, bestOf);

export const teamKey = (ids: string[]) => [...ids].sort().join('|');
export function casualHeadToHead(results: CasualResult[], home: string[], away: string[]) {
  const a = teamKey(home),
    b = teamKey(away);
  const meetings = results.filter(
    (r) =>
      r.status === 'confirmed' &&
      ((teamKey(r.homePlayerIds) === a && teamKey(r.awayPlayerIds) === b) ||
        (teamKey(r.homePlayerIds) === b && teamKey(r.awayPlayerIds) === a)),
  );
  let won = 0,
    framesFor = 0,
    framesAgainst = 0;
  for (const r of meetings) {
    const own = teamKey(r.homePlayerIds) === a ? r.score.home : r.score.away;
    const other = teamKey(r.homePlayerIds) === a ? r.score.away : r.score.home;
    if (own > other) won++;
    framesFor += own;
    framesAgainst += other;
  }
  return { played: meetings.length, won, lost: meetings.length - won, framesFor, framesAgainst };
}
export function canReviewCasual(result: CasualResult, actorId: string) {
  if (result.status !== 'pending' || !result.submittedBy) return false;
  const opposing = result.homePlayerIds.includes(result.submittedBy)
    ? result.awayPlayerIds
    : result.homePlayerIds;
  return opposing.includes(actorId);
}

/** Reviews/corrections do not reorder games; a resubmission does. */
export function casualSubmittedAt(result: CasualResult): string {
  return (
    result.history.filter((event) => event.action === 'submitted').at(-1)?.at ??
    result.submittedAt ??
    `${result.playedOn}T00:00:00Z`
  );
}
export function compareCasualHistory(a: CasualResult, b: CasualResult): number {
  return (
    b.playedOn.localeCompare(a.playedOn) ||
    Date.parse(casualSubmittedAt(b)) - Date.parse(casualSubmittedAt(a)) ||
    b.id.localeCompare(a.id)
  );
}
