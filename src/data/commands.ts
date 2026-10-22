import {
  addDays,
  canApprove,
  dateOnly,
  invariant,
  isParticipant,
  qualifiedIds,
  qualificationTie,
  regularComplete,
  requireAdmin,
  validScore,
  validateDate,
  winner,
} from '../domain/rules';
import { generateRoundRobin } from '../domain/rules';
import type { Fixture, LeagueState, ResultRevision, Season } from '../domain/types';
import type { LeagueCommand, NotificationService } from './contracts';
import { executeBookingCommand } from './bookingCommands';
import { executeCasualCommand } from './casualCommands';
import { executeSeasonLifecycle } from './seasonCommands';
import { canAddSeasonPlayer } from '../domain/seasonManagement';

const id = () => crypto.randomUUID();
const text = (value: string, label: string, max = 300) => {
  invariant(
    value.trim().length > 0 && value.trim().length <= max,
    `${label} is required (maximum ${max} characters).`,
  );
  return value.trim();
};
export const inAppNotifications: NotificationService = {
  publish(state, recipientIds, notification) {
    for (const userId of new Set(recipientIds))
      state.notifications.unshift({
        ...notification,
        id: id(),
        userId,
        read: false,
        createdAt: new Date().toISOString(),
      });
  },
};
function audit(
  fixture: Fixture,
  actorId: string,
  action: ResultRevision['action'],
  reason?: string,
) {
  fixture.history.push({
    id: id(),
    actorId,
    action,
    at: new Date().toISOString(),
    score: fixture.score ? { ...fixture.score } : undefined,
    reason,
  });
}
function seedPlayoffs(state: LeagueState, season: Season, force = false, reason?: string) {
  season.qualifiers = qualifiedIds(season, state.fixtures, force);
  season.status = 'playoffs';
  season.finalizedReason = reason;
  const semifinalRound =
    Math.max(
      0,
      ...state.fixtures
        .filter((f) => f.seasonId === season.id && f.stage === 'regular')
        .map((f) => f.round),
    ) + 1;
  const end = state.fixtures
    .filter((f) => f.seasonId === season.id)
    .reduce((max, f) => (f.dueDate > max ? f.dueDate : max), season.startDate);
  for (const [index, home, away] of [
    [0, 0, 3],
    [1, 1, 2],
  ]) {
    state.fixtures.push({
      id: `${season.id}-sf${index + 1}`,
      seasonId: season.id,
      round: semifinalRound,
      homeId: season.qualifiers[home],
      awayId: season.qualifiers[away],
      dueDate: addDays(end, 4),
      stage: 'semifinal',
      bestOf: 5,
      status: 'scheduled',
      history: [],
    });
  }
}
function progressPlayoffs(state: LeagueState, season: Season) {
  if (
    season.status === 'regular' &&
    season.participantIds.length >= 4 &&
    regularComplete(season, state.fixtures) &&
    qualificationTie(season, state.fixtures).length === 0
  )
    seedPlayoffs(state, season);
  if (season.status !== 'playoffs') return;
  const semis = state.fixtures.filter((f) => f.seasonId === season.id && f.stage === 'semifinal');
  const final = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'final');
  if (semis.length === 2 && semis.every(winner) && !final) {
    state.fixtures.push({
      id: `${season.id}-final`,
      seasonId: season.id,
      round: Math.max(...semis.map((f) => f.round)) + 1,
      homeId: winner(semis[0])!,
      awayId: winner(semis[1])!,
      dueDate: addDays(
        semis
          .map((f) => f.dueDate)
          .sort()
          .at(-1)!,
        4,
      ),
      stage: 'final',
      bestOf: 7,
      status: 'scheduled',
      history: [],
    });
  }
  if (final && winner(final)) {
    season.championId = winner(final);
    season.status = 'complete';
  }
}

/** Shared transitions run in both adapters. The API supplies the verified actor;
 * browser-only mock identity is not a security boundary. */
export function executeCommand(
  source: LeagueState,
  command: LeagueCommand,
  notifications: NotificationService = inAppNotifications,
): LeagueState {
  if (command.type === 'endSeason' || command.type === 'deleteSeason')
    return executeSeasonLifecycle(source, command);
  if (
    command.type === 'submitCasual' ||
    command.type === 'reviewCasual' ||
    command.type === 'resolveCasual' ||
    command.type === 'voidCasual'
  )
    return executeCasualCommand(source, command);
  if (
    command.type === 'saveBooking' ||
    command.type === 'cancelBooking' ||
    command.type === 'bookingConfig'
  )
    return executeBookingCommand(source, command);
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(actor?.active, 'An active account is required.');
  if (command.type === 'updateProfile') {
    actor.name = text(command.name, 'Display name', 70);
    for (const participant of state.participants)
      if (participant.kind === 'individual' && participant.playerIds.includes(actor.id))
        participant.name = actor.name;
    return state;
  }
  if ('fixtureId' in command) {
    const fixture = state.fixtures.find((f) => f.id === command.fixtureId);
    invariant(fixture, 'Match not found.');
    const season = state.seasons.find((s) => s.id === fixture.seasonId)!;
    const players = state.participants
      .filter((p) => [fixture.homeId, fixture.awayId].includes(p.id))
      .flatMap((p) => p.playerIds);
    const closedRegular =
      fixture.stage === 'regular' && ['playoffs', 'complete'].includes(season.status);
    switch (command.type) {
      case 'submit':
        invariant(
          !closedRegular && season.status !== 'complete',
          'This competition stage is closed.',
        );
        invariant(
          isParticipant(fixture, actor.id, state.participants),
          'Only a participant can submit this result.',
        );
        invariant(
          ['scheduled', 'postponed'].includes(fixture.status),
          'This match already has a result or is closed.',
        );
        invariant(
          validScore(command.score, fixture.bestOf),
          'Choose a valid completed match score.',
        );
        fixture.score = command.score;
        fixture.submittedBy = actor.id;
        fixture.status = 'pending';
        audit(fixture, actor.id, 'submitted');
        notifications.publish(
          state,
          players.filter((p) => canApprove(fixture, p, state.participants)),
          {
            seasonId: season.id,
            fixtureId: fixture.id,
            kind: 'approval',
            title: 'Your confirmation is needed',
            body: `${actor.name} submitted ${command.score.home}–${command.score.away}. Review the match result.`,
          },
        );
        break;
      case 'review':
        invariant(
          !closedRegular && canApprove(fixture, actor.id, state.participants),
          'Only the opposing participant can review a pending result.',
        );
        fixture.status = command.approve ? 'confirmed' : 'disputed';
        audit(
          fixture,
          actor.id,
          command.approve ? 'approved' : 'disputed',
          command.approve ? undefined : text(command.reason, 'Dispute reason'),
        );
        notifications.publish(
          state,
          command.approve
            ? players
            : [...players, ...state.players.filter((p) => p.role === 'admin').map((p) => p.id)],
          {
            seasonId: season.id,
            fixtureId: fixture.id,
            kind: command.approve ? 'approved' : 'disputed',
            title: command.approve ? 'Result confirmed' : 'Result disputed',
            body: command.approve ? 'The approved result is now recorded.' : command.reason.trim(),
          },
        );
        break;
      case 'correct': {
        requireAdmin(actor);
        invariant(
          ['confirmed', 'disputed', 'pending'].includes(fixture.status),
          'Only an existing result can be resolved or corrected.',
        );
        invariant(
          validScore(command.score, fixture.bestOf),
          'Choose a valid completed match score.',
        );
        const reason = text(command.reason, 'Correction reason');
        if (fixture.stage === 'semifinal') {
          const final = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'final');
          const newWinner =
            command.score.home > command.score.away ? fixture.homeId : fixture.awayId;
          if (final && newWinner !== winner(fixture)) {
            invariant(
              final.status === 'scheduled' && !final.history.length,
              'A final has started. Its participants cannot be changed by a semifinal correction.',
            );
            if (final.homeId === winner(fixture)) final.homeId = newWinner;
            else final.awayId = newWinner;
          }
        }
        fixture.score = command.score;
        fixture.status = 'confirmed';
        audit(fixture, actor.id, 'corrected', reason);
        if (fixture.stage === 'final') {
          season.championId = winner(fixture);
          season.status = 'complete';
        }
        notifications.publish(state, players, {
          seasonId: season.id,
          fixtureId: fixture.id,
          kind: 'approved',
          title: 'Administrator updated a result',
          body: reason,
        });
        break;
      }
      case 'postpone':
      case 'reschedule':
        invariant(
          !closedRegular && season.status !== 'complete',
          'This competition stage is closed.',
        );
        invariant(
          ['scheduled', 'postponed'].includes(fixture.status),
          'A match with a submitted result cannot be rescheduled.',
        );
        if (command.type === 'reschedule') requireAdmin(actor);
        else
          invariant(
            actor.role === 'admin' || isParticipant(fixture, actor.id, state.participants),
            'Only a participant or administrator can postpone this match.',
          );
        validateDate(command.dueDate);
        invariant(
          command.dueDate >= season.startDate,
          'The due date must be on or after the season starts.',
        );
        fixture.note = text(command.reason, 'Reason');
        fixture.dueDate = command.dueDate;
        fixture.status = command.type === 'postpone' ? 'postponed' : 'scheduled';
        audit(
          fixture,
          actor.id,
          command.type === 'postpone' ? 'postponed' : 'rescheduled',
          `${fixture.note} • Due ${fixture.dueDate}`,
        );
        notifications.publish(state, players, {
          seasonId: season.id,
          fixtureId: fixture.id,
          kind: 'postponement',
          title: command.type === 'postpone' ? 'Fixture postponed' : 'Fixture rescheduled',
          body: `${fixture.note}. New due date: ${fixture.dueDate}.`,
        });
        break;
    }
    progressPlayoffs(state, season);
    return state;
  }
  if (command.type === 'readNotifications') {
    state.notifications.forEach((n) => {
      if (n.userId === actor.id && command.ids.includes(n.id)) n.read = true;
    });
    return state;
  }
  requireAdmin(actor);
  switch (command.type) {
    case 'addSeasonPlayer': {
      const season = state.seasons.find((s) => s.id === command.seasonId);
      invariant(
        season && canAddSeasonPlayer(state, season),
        'Players can only be added to a draft or unfinalized singles regular season.',
      );
      invariant(season.participantIds.length < 40, 'A season supports up to 40 players.');
      validateDate(command.dueDate);
      invariant(command.dueDate >= dateOnly(), 'Choose a catch-up deadline of today or later.');
      const player = state.players.find((p) => p.id === command.playerId);
      invariant(player?.active, 'Choose an active colleague.');
      const opponents = season.participantIds.map((pid) =>
        state.participants.find((p) => p.id === pid)!,
      );
      invariant(
        opponents.every((p) => p?.kind === 'individual' && p.playerIds.length === 1),
        'This action supports individual season participants only.',
      );
      invariant(
        !opponents.some((p) => p.playerIds.includes(player.id)),
        'This player is already in the season.',
      );
      let entrant = state.participants.find(
        (p) => p.kind === 'individual' && p.playerIds.length === 1 && p.playerIds[0] === player.id,
      );
      if (!entrant) {
        entrant = { id: id(), name: player.name, kind: 'individual', playerIds: [player.id] };
        state.participants.push(entrant);
      }
      if (season.status === 'draft') {
        season.participantIds.push(entrant.id);
        if (player.role === 'colleague') player.role = 'player';
        break;
      }
      const firstRound =
        Math.max(0, ...state.fixtures.filter((f) => f.seasonId === season.id).map((f) => f.round)) +
        1;
      for (const [index, opponent] of opponents.entries()) {
        invariant(
          !state.fixtures.some(
            (f) =>
              f.seasonId === season.id &&
              [f.homeId, f.awayId].includes(entrant.id) &&
              [f.homeId, f.awayId].includes(opponent.id),
          ),
          'This pairing already has a fixture.',
        );
        const dueDate = command.dueDate;
        const fixture: Fixture = {
          id: id(),
          seasonId: season.id,
          stage: 'regular',
          bestOf: 3,
          round: firstRound + index,
          homeId: index % 2 ? opponent.id : entrant.id,
          awayId: index % 2 ? entrant.id : opponent.id,
          dueDate,
          status: 'postponed',
          history: [],
          note: `Catch-up fixture: ${player.name} joined the season late.`,
        };
        audit(fixture, actor.id, 'postponed', fixture.note);
        state.fixtures.push(fixture);
        notifications.publish(state, [player.id, ...opponent.playerIds], {
          seasonId: season.id,
          fixtureId: fixture.id,
          kind: 'postponement',
          title: 'New catch-up fixture',
          body: `${player.name} v ${opponent.name} · Due ${dueDate}. A player joined the season late.`,
        });
      }
      season.participantIds.push(entrant.id);
      if (player.role === 'colleague') player.role = 'player';
      break;
    }
    case 'enrolPlayer': {
      const player = state.players.find((p) => p.id === command.id);
      invariant(player?.active, 'Choose an active colleague.');
      invariant(
        !state.participants.some((p) => p.kind === 'individual' && p.playerIds.includes(player.id)),
        'This colleague is already a league player.',
      );
      state.participants.push({
        id: id(),
        name: player.name,
        kind: 'individual',
        playerIds: [player.id],
      });
      if (player.role === 'colleague') player.role = 'player';
      break;
    }
    case 'createSeason': {
      validateDate(command.startDate);
      invariant(
        command.participantIds.length >= 4 &&
          new Set(command.participantIds).size === command.participantIds.length,
        'Select at least four unique players.',
      );
      // Existing entry IDs remain valid; first-time entrants can be selected by account ID.
      const participantIds = command.participantIds.map((selection) => {
        const selectedEntry = state.participants.find((p) => p.id === selection);
        const player = state.players.find(
          (p) =>
            p.id ===
            (selectedEntry?.kind === 'individual' && selectedEntry.playerIds.length === 1
              ? selectedEntry.playerIds[0]
              : selection),
        );
        invariant(player?.active, 'Select active individual participants.');
        let entry = state.participants.find(
          (p) =>
            p.kind === 'individual' && p.playerIds.length === 1 && p.playerIds[0] === player.id,
        );
        if (!entry) {
          entry = { id: id(), name: player.name, kind: 'individual', playerIds: [player.id] };
          state.participants.push(entry);
        }
        if (player.role === 'colleague') player.role = 'player';
        return entry.id;
      });
      invariant(
        new Set(participantIds).size === participantIds.length,
        'Select at least four unique players.',
      );
      invariant(
        Number.isInteger(command.roundsPerWeek) &&
          command.roundsPerWeek >= 1 &&
          command.roundsPerWeek <= 7,
        'Use one to seven rounds per week.',
      );
      const seasonId = id();
      state.seasons.unshift({
        id: seasonId,
        name: text(command.name, 'Season name', 80),
        startDate: command.startDate,
        participantIds,
        format: 'singles',
        status: 'draft',
        config: { roundsPerWeek: command.roundsPerWeek },
        qualifiers: [],
      });
      state.selectedSeasonId = seasonId;
      break;
    }
    case 'updateSeason': {
      const season = state.seasons.find((s) => s.id === command.seasonId);
      invariant(season, 'Season not found.');
      season.name = text(command.name, 'Season name', 80);
      if (season.status === 'draft') {
        validateDate(command.startDate);
        invariant(
          Number.isInteger(command.roundsPerWeek) &&
            command.roundsPerWeek >= 1 &&
            command.roundsPerWeek <= 7,
          'Use one to seven rounds per week.',
        );
        season.startDate = command.startDate;
        season.config.roundsPerWeek = command.roundsPerWeek;
      }
      break;
    }
    case 'generate': {
      const season = state.seasons.find((s) => s.id === command.seasonId);
      invariant(season?.status === 'draft', 'Fixtures can only be generated for a draft season.');
      invariant(
        !state.fixtures.some((f) => f.seasonId === season.id),
        'This season already has fixtures.',
      );
      const fixtures = generateRoundRobin(season);
      state.fixtures.push(...fixtures);
      season.status = 'regular';
      notifications.publish(
        state,
        state.participants
          .filter((p) => season.participantIds.includes(p.id))
          .flatMap((p) => p.playerIds),
        {
          seasonId: season.id,
          kind: 'notice',
          title: 'Fixtures are published',
          body: `${season.name} is ready. Arrange your matches with your opponents.`,
        },
      );
      break;
    }
    case 'finalize': {
      const season = state.seasons.find((s) => s.id === command.seasonId);
      invariant(season?.status === 'regular', 'Only a regular season can be finalized.');
      const reason = text(command.reason, 'Finalization reason');
      const qualifiers = qualifiedIds(season, state.fixtures, true);
      for (const fixture of state.fixtures.filter(
        (f) => f.seasonId === season.id && f.stage === 'regular' && f.status !== 'confirmed',
      )) {
        fixture.status = 'cancelled';
        audit(fixture, actor.id, 'cancelled', reason);
      }
      seedPlayoffs(state, season, true, reason);
      season.qualifiers = qualifiers;
      break;
    }
    case 'savePlayer': {
      const name = text(command.name, 'Player name', 70),
        department = text(command.department, 'Department', 70);
      const player = state.players.find((p) => p.id === command.id);
      if (player) {
        invariant(
          player.id !== actor.id || command.active,
          'You cannot deactivate the current administrator.',
        );
        player.name = name;
        player.department = department;
        player.active = command.active;
        const participant = state.participants.find(
          (p) => p.kind === 'individual' && p.playerIds.includes(player.id),
        );
        if (participant) participant.name = name;
      } else {
        invariant(!command.id, 'Player not found.');
        const playerId = id();
        state.players.push({
          id: playerId,
          name,
          department,
          active: true,
          role: 'player',
          color: state.players.length % 6,
        });
        state.participants.push({
          id: `entry-${playerId}`,
          name,
          kind: 'individual',
          playerIds: [playerId],
        });
      }
      break;
    }
    case 'availability':
    case 'removeAvailability':
      throw new Error(
        'Unavailability recording has been retired. Postpone individual fixtures instead.',
      );
    case 'announce': {
      invariant(
        state.seasons.some((s) => s.id === command.seasonId),
        'Season not found.',
      );
      const title = text(command.title, 'Title', 100),
        body = text(command.body, 'Announcement', 1000);
      state.announcements.unshift({
        id: id(),
        seasonId: command.seasonId,
        title,
        body,
        createdAt: new Date().toISOString(),
      });
      notifications.publish(
        state,
        state.players.filter((p) => p.active).map((p) => p.id),
        { seasonId: command.seasonId, kind: 'notice', title, body },
      );
      break;
    }
  }
  return state;
}
