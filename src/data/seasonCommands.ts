import type { LeagueState } from '../domain/types';
import { invariant, requireAdmin } from '../domain/rules';
import { seasonDeletionBlock } from '../domain/seasonManagement';
import { bookingEnd } from '../domain/bookings';

export type SeasonLifecycleCommand =
  | { type: 'endSeason'; seasonId: string; reason: string }
  | { type: 'deleteSeason'; seasonId: string; confirmName: string };

export function executeSeasonLifecycle(
  source: LeagueState,
  command: SeasonLifecycleCommand,
): LeagueState {
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(!state.readOnly && actor?.active, 'An active account is required.');
  requireAdmin(actor);
  const season = state.seasons.find((s) => s.id === command.seasonId);
  invariant(season, 'Season not found.');
  if (command.type === 'deleteSeason') {
    invariant(
      command.confirmName === season.name,
      'Type the season name exactly to confirm deletion.',
    );
    const blocked = seasonDeletionBlock(state, season);
    invariant(!blocked, blocked ?? 'Season cannot be deleted.');
    state.fixtures = state.fixtures.filter((f) => f.seasonId !== season.id);
    state.notifications = state.notifications.filter((n) => n.seasonId !== season.id);
    state.announcements = state.announcements.filter((a) => a.seasonId !== season.id);
    state.seasons = state.seasons.filter((s) => s.id !== season.id);
    if (state.selectedSeasonId === season.id) state.selectedSeasonId = state.seasons[0]?.id ?? '';
  } else {
    invariant(season.status !== 'complete', 'This season has already ended.');
    const reason = command.reason.trim();
    invariant(
      reason.length >= 5 && reason.length <= 300,
      'Enter an ending reason (5–300 characters).',
    );
    const at = new Date().toISOString();
    const cancelled = new Set<string>();
    for (const fixture of state.fixtures.filter(
      (f) => f.seasonId === season.id && !['confirmed', 'cancelled'].includes(f.status),
    )) {
      fixture.status = 'cancelled';
      fixture.history.push({
        id: crypto.randomUUID(),
        actorId: actor.id,
        action: 'cancelled',
        at,
        reason: `Season ended: ${reason}`,
        score: fixture.score ? { ...fixture.score } : undefined,
      });
      cancelled.add(fixture.id);
    }
    for (const b of state.bookings)
      if (
        b.status === 'reserved' &&
        b.fixtureId &&
        cancelled.has(b.fixtureId) &&
        Date.parse(bookingEnd(b)) > Date.parse(at)
      ) {
        b.status = 'cancelled';
        b.updatedAt = at;
      }
    season.status = 'complete';
    season.finalizedReason = [season.finalizedReason, `Ended early: ${reason}`]
      .filter(Boolean)
      .join('\n');
    const recipients = new Set(
      state.participants
        .filter((p) => season.participantIds.includes(p.id))
        .flatMap((p) => p.playerIds),
    );
    for (const userId of recipients)
      state.notifications.unshift({
        id: crypto.randomUUID(),
        userId,
        seasonId: season.id,
        kind: 'notice',
        title: 'Season ended',
        body: `${season.name}: ${reason}. Outstanding matches are closed without automatic losses.`,
        createdAt: at,
        read: false,
      });
  }
  return state;
}
