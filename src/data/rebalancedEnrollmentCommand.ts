import type { LeagueState, ResultRevision } from '../domain/types';
import type { NotificationService } from './contracts';
import { invariant, requireAdmin, weekLabel } from '../domain/rules';
import { planRebalancedEnrollment } from '../domain/rebalancedEnrollment';

export interface RebalancedEnrollmentCommand {
  type: 'acceptJoinRequestsAndRebalance';
  seasonId: string;
  requestIds: string[];
  previewKey: string;
}

export function executeRebalancedEnrollment(
  source: LeagueState,
  command: RebalancedEnrollmentCommand,
  notifications: NotificationService,
) {
  invariant(!source.readOnly, 'Administrator access required.');
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(actor?.active, 'An active account is required.');
  requireAdmin(actor);
  const plan = planRebalancedEnrollment(state, command.seasonId, command.requestIds);
  invariant(
    plan.previewKey === command.previewKey,
    'The schedule preview has changed. Close it, refresh the league and preview again.',
  );
  const season = state.seasons.find((s) => s.id === command.seasonId)!;
  const at = new Date().toISOString();
  const ids = new Map<string, string>();
  for (const entry of plan.entries) {
    if (!state.participants.some((p) => p.id === entry.id)) {
      const id = crypto.randomUUID();
      ids.set(entry.id, id);
      state.participants.push({ ...entry, id });
    }
    season.participantIds.push(ids.get(entry.id) ?? entry.id);
    const player = state.players.find((p) => p.id === entry.playerIds[0])!;
    if (player.role === 'colleague') player.role = 'player';
  }
  const event = (reason: string): ResultRevision => ({
    id: crypto.randomUUID(),
    action: 'rescheduled',
    actorId: actor.id,
    at,
    reason,
  });
  const notifyFixture = (
    fixtureId: string,
    homeId: string,
    awayId: string,
    title: string,
    body: string,
  ) => {
    const users = [homeId, awayId].flatMap(
      (id) => state.participants.find((p) => p.id === id)!.playerIds,
    );
    notifications.publish(state, users, {
      seasonId: season.id,
      fixtureId,
      kind: 'upcoming',
      title,
      body,
    });
  };
  for (const moved of plan.moved) {
    const f = state.fixtures.find((f) => f.id === moved.id)!;
    f.dueDate = moved.to;
    const reason = `Late-entry schedule revision: ${weekLabel(moved.from)} → ${weekLabel(moved.to)}. Existing results, this week and booked fixtures are protected.`;
    f.history.push(event(reason));
    notifyFixture(
      f.id,
      f.homeId,
      f.awayId,
      'League fixture week updated',
      `${weekLabel(moved.from)} → ${weekLabel(moved.to)}. New league members have joined; view the revised schedule.`,
    );
  }
  for (const addition of plan.additions) {
    const f = {
      ...addition,
      id: crypto.randomUUID(),
      homeId: ids.get(addition.homeId) ?? addition.homeId,
      awayId: ids.get(addition.awayId) ?? addition.awayId,
      history: [event('New pairing created as part of an approved late-entry schedule revision.')],
      note: 'Additional league fixture following late enrollment.',
    };
    state.fixtures.push(f);
    notifyFixture(
      f.id,
      f.homeId,
      f.awayId,
      'New league fixture',
      `${weekLabel(f.dueDate)}. A new league member has joined; view your fixtures.`,
    );
  }
  for (const request of state.joinRequests!.filter((r) => command.requestIds.includes(r.id))) {
    request.status = 'approved';
    request.reviewedAt = at;
    request.reviewedBy = actor.id;
    notifications.publish(state, [request.playerId], {
      seasonId: season.id,
      joinRequestId: request.id,
      kind: 'notice',
      title: 'League join request accepted',
      body: 'You have joined the league. Your fixtures are available in the revised weekly schedule.',
    });
  }
  return state;
}
