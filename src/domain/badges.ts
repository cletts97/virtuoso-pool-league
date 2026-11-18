import type { BadgeAward, BadgeKey, LeagueState, PublicBadge } from './types';
import { validFixtureScore, winner } from './rules';
import { validCasualScore } from './casual';

export const BADGES: Record<BadgeKey, { name: string; description: string; season: boolean }> = {
  season_champion: {
    name: 'Season champion',
    description: 'Won the season’s playoff final.',
    season: true,
  },
  runner_up: {
    name: 'Runner-up',
    description: 'Reached the season’s playoff final.',
    season: true,
  },
  league_leader: {
    name: 'League leader',
    description: 'Finished first in the regular season and qualified as the top seed.',
    season: true,
  },
  seven_ball: {
    name: 'Seven-ball finish',
    description: 'Legally won a frame with all seven of the opponent’s colours still on the table.',
    season: false,
  },
  break_dish: {
    name: 'Break and dish',
    description:
      'Made a legal break and cleared your colours and the black in that opening visit, without the opponent taking a shot.',
    season: false,
  },
  reverse_dish: {
    name: 'Reverse dish',
    description:
      'After the opponent’s legal dry break, cleared all seven of your colours and the black in your first uninterrupted visit.',
    season: false,
  },
};
export const PLAYING_BADGES = ['seven_ball', 'break_dish', 'reverse_dish'] as const;
export function publicBadgeSummary(a: PublicBadge): PublicBadge {
  return {
    id: a.id,
    playerId: a.playerId,
    badgeKey: a.badgeKey,
    seasonId: a.seasonId,
    fixtureId: a.fixtureId,
    casualResultId: a.casualResultId,
    createdAt: a.createdAt,
  };
}
export function badgeMatch(
  state: LeagueState,
  award: Pick<BadgeAward, 'fixtureId' | 'casualResultId'>,
) {
  if (award.fixtureId) {
    const match = state.fixtures.find((f) => f.id === award.fixtureId);
    if (!match) return undefined;
    return {
      ...match,
      homePlayerIds: state.participants.find((p) => p.id === match.homeId)?.playerIds ?? [],
      awayPlayerIds: state.participants.find((p) => p.id === match.awayId)?.playerIds ?? [],
      valid: !!match.score && validFixtureScore(match, match.score),
    };
  }
  const match = state.casualResults?.find((r) => r.id === award.casualResultId);
  return match ? { ...match, valid: validCasualScore(match.score, match.bestOf) } : undefined;
}
export function currentBadgeClaim(state: LeagueState, award: BadgeAward) {
  const match = badgeMatch(state, award);
  return (
    !!match &&
    match.valid &&
    ['pending', 'confirmed'].includes(match.status) &&
    [...match.history].reverse().find((h) => h.action === 'submitted')?.id === award.submissionId &&
    !['corrected', 'cancelled', 'disputed'].includes(match.history.at(-1)?.action ?? '')
  );
}
export function canReviewBadge(
  state: LeagueState,
  award: BadgeAward,
  actorId = state.currentUserId,
) {
  if (
    state.readOnly ||
    award.source !== 'claim' ||
    award.status !== 'pending' ||
    !currentBadgeClaim(state, award)
  )
    return false;
  if (!state.players.some((p) => p.id === actorId && p.active)) return false;
  const match = badgeMatch(state, award)!;
  const opponents = match.homePlayerIds.includes(award.playerId)
    ? match.awayPlayerIds
    : match.homePlayerIds;
  return opponents.includes(actorId);
}
/** Only earned, still-valid awards can be displayed publicly. */
export function earnedBadges(state: LeagueState, playerId?: string): PublicBadge[] {
  const awards = state.publicBadges
    ? state.publicBadges.filter((a) => !playerId || a.playerId === playerId)
    : (state.badgeAwards ?? []).filter(
        (a) =>
          a.status === 'confirmed' &&
          (!playerId || a.playerId === playerId) &&
          (a.source !== 'claim' ||
            (currentBadgeClaim(state, a) && badgeMatch(state, a)?.status === 'confirmed')),
      );
  // One season award per person/type/season even when granted manually as well.
  const order = Object.keys(BADGES);
  return awards
    .filter(
      (a, i) =>
        !BADGES[a.badgeKey].season ||
        awards.findIndex(
          (b) =>
            b.playerId === a.playerId && b.badgeKey === a.badgeKey && b.seasonId === a.seasonId,
        ) === i,
    )
    .sort(
      (a, b) =>
        order.indexOf(a.badgeKey) - order.indexOf(b.badgeKey) ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function automaticBadgeTargets(state: LeagueState) {
  const targets: { playerId: string; badgeKey: BadgeKey; seasonId: string }[] = [];
  for (const season of state.seasons.filter((s) => s.status !== 'draft')) {
    const add = (participantId: string | undefined, badgeKey: BadgeKey) => {
      for (const playerId of state.participants.find((p) => p.id === participantId)?.playerIds ??
        [])
        targets.push({ playerId, badgeKey, seasonId: season.id });
    };
    if (season.qualifiers.length === 4) add(season.qualifiers[0], 'league_leader');
    const final = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'final');
    if (
      season.status === 'complete' &&
      final &&
      winner(final) &&
      validFixtureScore(final, final.score!)
    ) {
      add(winner(final), 'season_champion');
      add(winner(final) === final.homeId ? final.awayId : final.homeId, 'runner_up');
    }
  }
  return targets;
}
