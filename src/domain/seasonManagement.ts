import { dateOnly, weekStart } from './rules';
import type { LeagueState, Season } from './types';

/** Drafts are not running; published seasons begin on their London start-week Monday. */
export function canJoinSeasonDirectly(season: Season, today = dateOnly()) {
  return (
    season.status === 'draft' ||
    (season.status === 'regular' && today < weekStart(season.startDate))
  );
}
export function canAddSeasonPlayer(state: LeagueState, season: Season) {
  return (
    ['draft', 'regular'].includes(season.status) &&
    season.format === 'singles' &&
    !season.qualifiers.length &&
    !season.finalizedReason &&
    !state.fixtures.some(
      (f) => f.seasonId === season.id && (f.stage !== 'regular' || season.status === 'draft'),
    )
  );
}

export function seasonDeletionBlock(state: LeagueState, season: Season): string | undefined {
  const fixtures = state.fixtures.filter((f) => f.seasonId === season.id);
  if (
    season.championId ||
    season.qualifiers.length ||
    fixtures.some(
      (f) =>
        f.history.length ||
        f.score ||
        f.submittedBy ||
        ['pending', 'disputed', 'confirmed'].includes(f.status),
    )
  )
    return 'This season has recorded history. End it instead to preserve the records.';
  if (state.bookings.some((b) => fixtures.some((f) => f.id === b.fixtureId)))
    return 'This season has linked table bookings. End it instead to preserve those records.';
  return undefined;
}
