export type ID = string;
export interface Player {
  id: ID;
  name: string;
  department: string;
  role: 'player' | 'admin' | 'colleague';
  active: boolean;
  /** Retained historical identity after its sign-in account was deleted. */
  deleted?: boolean;
  color: number;
  /** Short-lived private Storage URL, supplied by the API; never persisted in league tables. */
  avatarUrl?: string;
}
// A participant is a competition entry, not necessarily an individual player.
export interface Participant {
  id: ID;
  name: string;
  playerIds: ID[];
  kind: 'individual' | 'team';
}
export interface LeagueConfig {
  roundsPerWeek: number;
}
export interface Season {
  id: ID;
  name: string;
  startDate: string;
  participantIds: ID[];
  format: 'singles' | 'doubles';
  status: 'draft' | 'regular' | 'playoffs' | 'complete';
  config: LeagueConfig;
  qualifiers: ID[];
  championId?: ID;
  finalizedReason?: string;
}
export type MatchStatus =
  'scheduled' | 'pending' | 'confirmed' | 'disputed' | 'postponed' | 'cancelled';
export type Stage = 'regular' | 'semifinal' | 'final';
export interface Score {
  home: number;
  away: number;
}
export interface ResultRevision {
  id: ID;
  score?: Score;
  action:
    | 'submitted'
    | 'approved'
    | 'auto_approved'
    | 'disputed'
    | 'corrected'
    | 'postponed'
    | 'rescheduled'
    | 'cancelled';
  actorId: ID | null;
  at: string;
  reason?: string;
}
export interface Fixture {
  revision?: number;
  bracketSlot?: number;
  id: ID;
  seasonId: ID;
  round: number;
  homeId: ID;
  awayId: ID;
  /** Monday identifying the playing week for new schedules; legacy dates use their containing week. */
  dueDate: string;
  stage: Stage;
  bestOf: 3 | 5 | 7;
  status: MatchStatus;
  score?: Score;
  submittedBy?: ID;
  history: ResultRevision[];
  note?: string;
}
export interface Availability {
  id: ID;
  playerId: ID;
  from: string;
  to: string;
  reason: string;
}
export type NotificationKind =
  'upcoming' | 'approval' | 'approved' | 'disputed' | 'postponement' | 'notice';
export interface LeagueNotification {
  id: ID;
  userId: ID;
  seasonId: ID | null;
  casualResultId?: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  fixtureId?: ID;
  createdAt: string;
  read: boolean;
}
export interface Announcement {
  id: ID;
  seasonId: ID;
  title: string;
  body: string;
  createdAt: string;
}
export interface LeagueState {
  recentResults?: import('./recentResults').RecentResult[];
  casualResults?: CasualResult[];
  /** False until the optional casual-results database migration is applied. */
  casualResultsEnabled?: boolean;
  /** Public, allowlisted snapshot. Never grants permission to mutate server data. */
  readOnly?: boolean;
  revision?: string;
  version: 3;
  bookings: Booking[];
  bookingConfig: BookingConfig;
  players: Player[];
  participants: Participant[];
  seasons: Season[];
  fixtures: Fixture[];
  availability: Availability[];
  notifications: LeagueNotification[];
  announcements: Announcement[];
  currentUserId: ID;
  selectedSeasonId: ID;
  theme: 'dark' | 'light';
}
export interface CasualResult {
  id: ID;
  homePlayerIds: ID[];
  awayPlayerIds: ID[];
  playedOn: string;
  bestOf: 1 | 3 | 5 | 7;
  score: Score;
  status: 'pending' | 'confirmed' | 'disputed' | 'cancelled';
  submittedBy?: ID;
  history: ResultRevision[];
}
/** User records live in players for compatibility; league membership is held in participants. */
export interface BookingConfig {
  timeZone: 'Europe/London';
  opensAt: string;
  closesAt: string;
  weekdays: number[];
}
export type BookingSport = 'pool' | 'table_tennis';
export interface BookingInput {
  /** Missing on historical mock saves; defaults to pool. */
  sport?: BookingSport;
  kind: 'league' | 'casual';
  startAt: string;
  // Keep historical 60-minute records readable; new/edited bookings are validated as 15 or 30.
  duration: 15 | 30 | 60;
  fixtureId?: ID;
  guestIds: ID[];
}
export interface Booking extends BookingInput {
  revision?: number;
  id: ID;
  ownerId: ID;
  status: 'reserved' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}
export interface Standing {
  participantId: ID;
  played: number;
  won: number;
  lost: number;
  framesWon: number;
  framesLost: number;
  difference: number;
  winPercentage: number;
  position: number;
  form: boolean[];
  unresolvedTie?: ID[];
}
