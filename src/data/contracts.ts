import type { LeagueState, Score } from '../domain/types';
import type { BookingCommand } from './bookingCommands';
import type { CasualCommand } from './casualCommands';
import type { SeasonLifecycleCommand } from './seasonCommands';

export type LeagueCommand =
  | SeasonLifecycleCommand
  | CasualCommand
  | { type: 'requestSeasonJoin'; seasonId: string }
  | { type: 'reviewSeasonJoin'; id: string; approve: boolean; dueDate: string }
  | { type: 'deleteUser'; id: string }
  | { type: 'updateProfile'; name: string }
  | { type: 'enrolPlayer'; id: string }
  | { type: 'addSeasonPlayer'; seasonId: string; playerId: string; dueDate: string }
  | BookingCommand
  | { type: 'submit'; fixtureId: string; score: Score }
  | { type: 'review'; fixtureId: string; approve: boolean; reason: string }
  | { type: 'correct'; fixtureId: string; score: Score; reason: string }
  | { type: 'postpone'; fixtureId: string; dueDate: string; reason: string }
  | { type: 'reschedule'; fixtureId: string; dueDate: string; reason: string }
  | { type: 'finalize'; seasonId: string; reason: string }
  | { type: 'generate'; seasonId: string }
  | {
      type: 'createSeason';
      name: string;
      startDate: string;
      participantIds: string[];
      roundsPerWeek: number;
    }
  | {
      type: 'updateSeason';
      seasonId: string;
      name: string;
      startDate: string;
      roundsPerWeek: number;
    }
  | { type: 'savePlayer'; id?: string; name: string; department: string; active: boolean }
  | { type: 'availability'; playerId: string; from: string; to: string; reason: string }
  | { type: 'removeAvailability'; id: string }
  | { type: 'announce'; seasonId: string; title: string; body: string }
  | { type: 'readNotifications'; ids: string[] };

/** Replace this adapter with an HTTP client. Actor identity must come from the server session. */
export interface LeagueRepository {
  load(): Promise<LeagueState>;
  execute(command: LeagueCommand): Promise<LeagueState>;
  saveAvatar(image: string | null): Promise<LeagueState>;
  preferences(
    patch: Partial<Pick<LeagueState, 'currentUserId' | 'selectedSeasonId' | 'theme'>>,
  ): Promise<LeagueState>;
  reset(): Promise<LeagueState>;
}
export interface NotificationService {
  publish(
    state: LeagueState,
    recipientIds: string[],
    notification: Omit<
      LeagueState['notifications'][number],
      'id' | 'userId' | 'read' | 'createdAt'
    >,
  ): void;
}
