import type { BadgeAward, BadgeClaimInput, BadgeKey, LeagueState } from '../domain/types';
import {
  BADGES,
  PLAYING_BADGES,
  automaticBadgeTargets,
  badgeMatch,
  canReviewBadge,
  currentBadgeClaim,
} from '../domain/badges';
import { invariant, requireAdmin } from '../domain/rules';

export type BadgeCommand =
  | { type: 'reviewBadge'; id: string; approve: boolean }
  | { type: 'grantBadge'; playerId: string; badgeKey: BadgeKey; seasonId?: string; reason?: string }
  | { type: 'revokeBadge'; id: string; reason: string };

function event(
  award: BadgeAward,
  action: BadgeAward['history'][number]['action'],
  actorId: string | null,
  reason?: string,
  now = new Date(),
) {
  award.history.push({ action, actorId, reason, at: now.toISOString() });
}
export function synchronizeBadges(state: LeagueState, now = new Date()) {
  if (state.badgesEnabled === false) return state;
  const awards = (state.badgeAwards ??= []);
  const targets = automaticBadgeTargets(state);
  const same = (a: BadgeAward, t: (typeof targets)[number]) =>
    a.source === 'automatic' &&
    a.playerId === t.playerId &&
    a.badgeKey === t.badgeKey &&
    a.seasonId === t.seasonId;
  for (const a of awards) {
    if (
      (a.source === 'automatic' && a.status === 'confirmed' && !targets.some((t) => same(a, t))) ||
      (a.source === 'claim' &&
        ['pending', 'confirmed'].includes(a.status) &&
        !currentBadgeClaim(state, a))
    ) {
      a.status = 'revoked';
      event(a, 'revoked', null, 'The linked result or season award changed.', now);
    }
  }
  for (const target of targets) {
    const old = awards.find((a) => same(a, target));
    if (old) {
      // An administrator’s explicit revocation remains in effect.
      if (old.status === 'revoked' && old.history.at(-1)?.actorId === null) {
        old.status = 'confirmed';
        event(old, 'granted', null, 'Season award restored after a result correction.', now);
      }
    } else {
      const award: BadgeAward = {
        ...target,
        id: crypto.randomUUID(),
        source: 'automatic',
        status: 'confirmed',
        createdAt: now.toISOString(),
        history: [],
      };
      event(award, 'granted', null, 'Automatic season award.', now);
      awards.push(award);
    }
  }
  return state;
}
export function addBadgeClaims(
  state: LeagueState,
  match: { fixtureId?: string; casualResultId?: string },
  claims: BadgeClaimInput[],
) {
  invariant(state.badgesEnabled !== false, 'Badges are not available yet.');
  invariant(claims.length <= 12, 'Choose at most twelve achievements per match.');
  const result = badgeMatch(state, match);
  invariant(result?.status === 'pending', 'Submit the score before claiming an achievement.');
  const submissionId = [...result.history].reverse().find((h) => h.action === 'submitted')?.id;
  invariant(submissionId, 'A submitted score is required.');
  const awards = (state.badgeAwards ??= []);
  for (const claim of claims) {
    invariant(PLAYING_BADGES.includes(claim.badgeKey), 'Choose a playing achievement.');
    const home = result.homePlayerIds.includes(claim.playerId),
      away = result.awayPlayerIds.includes(claim.playerId);
    invariant(
      (home || away) && state.players.some((p) => p.id === claim.playerId && p.active),
      'Choose someone who played this match.',
    );
    invariant(
      result.score && (home ? result.score.home : result.score.away) > 0,
      'The achievement recipient must have won a frame.',
    );
    invariant(
      claims.filter(
        (c) => c.playerId === claim.playerId && ['break_dish', 'reverse_dish'].includes(c.badgeKey),
      ).length <= (home ? result.score!.home : result.score!.away),
      'Break and dish and Reverse dish require separate winning frames.',
    );
    invariant(
      !awards.some(
        (a) =>
          a.submissionId === submissionId &&
          a.playerId === claim.playerId &&
          a.badgeKey === claim.badgeKey,
      ),
      'This achievement has already been claimed for this submission.',
    );
    const award: BadgeAward = {
      ...claim,
      ...match,
      seasonId: 'seasonId' in result ? result.seasonId : undefined,
      id: crypto.randomUUID(),
      source: 'claim',
      status: 'pending',
      submissionId,
      createdAt: new Date().toISOString(),
      history: [],
    };
    event(award, 'claimed', state.currentUserId);
    awards.push(award);
    const opponents = home ? result.awayPlayerIds : result.homePlayerIds;
    for (const userId of opponents.filter((id) => id !== state.currentUserId))
      state.notifications.unshift({
        id: crypto.randomUUID(),
        userId,
        seasonId: award.seasonId ?? null,
        fixtureId: award.fixtureId,
        casualResultId: award.casualResultId,
        kind: 'approval',
        title: 'Achievement needs your review',
        body: `${state.players.find((p) => p.id === claim.playerId)!.name} · ${BADGES[claim.badgeKey].name}. Open the match to confirm or decline this achievement separately from the score.`,
        createdAt: award.createdAt,
        read: false,
      });
  }
}
export function executeBadgeCommand(source: LeagueState, command: BadgeCommand) {
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(!state.readOnly && actor?.active, 'An active account is required.');
  invariant(state.badgesEnabled !== false, 'Badges are not available yet.');
  const awards = (state.badgeAwards ??= []);
  if (command.type === 'grantBadge') {
    requireAdmin(actor);
    invariant(Object.hasOwn(BADGES, command.badgeKey), 'Unknown badge.');
    invariant(
      state.players.some((p) => p.id === command.playerId && p.active),
      'Choose an active player.',
    );
    invariant(
      !command.seasonId ||
        state.seasons.some((s) => s.id === command.seasonId && s.status !== 'draft'),
      'Choose a published season.',
    );
    invariant(
      !BADGES[command.badgeKey].season || !!command.seasonId,
      'Choose the season for this award.',
    );
    invariant(
      !command.reason || command.reason.trim().length <= 300,
      'Use at most 300 characters.',
    );
    invariant(
      !BADGES[command.badgeKey].season ||
        !awards.some(
          (a) =>
            a.status === 'confirmed' &&
            a.playerId === command.playerId &&
            a.badgeKey === command.badgeKey &&
            a.seasonId === command.seasonId,
        ),
      'This player already has that season award.',
    );
    const award: BadgeAward = {
      id: crypto.randomUUID(),
      playerId: command.playerId,
      badgeKey: command.badgeKey,
      seasonId: command.seasonId,
      source: 'manual',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      history: [],
    };
    event(award, 'granted', actor.id, command.reason?.trim());
    awards.push(award);
  } else {
    const award = awards.find((a) => a.id === command.id);
    invariant(award, 'Badge not found.');
    if (command.type === 'reviewBadge') {
      invariant(
        canReviewBadge(state, award, actor.id),
        'Only an opposing player can review this pending achievement.',
      );
      award.status = command.approve ? 'confirmed' : 'rejected';
      event(award, command.approve ? 'confirmed' : 'rejected', actor.id);
    } else {
      requireAdmin(actor);
      invariant(['pending', 'confirmed'].includes(award.status), 'This badge is already closed.');
      invariant(
        command.reason.trim().length > 0 && command.reason.trim().length <= 300,
        'Enter a reason (maximum 300 characters).',
      );
      award.status = 'revoked';
      event(award, 'revoked', actor.id, command.reason.trim());
    }
  }
  return state;
}
