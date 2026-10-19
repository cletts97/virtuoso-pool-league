export type ID = string;
export interface Player {
  id: ID;
  name: string;
  department: string;
  role: 'player' | 'admin';
  active: boolean;
  color: number;
}
// A participant is a competition entry, not necessarily an individual player.
export interface Participant {
  id: ID;
  name: string;
  playerIds: ID[];
  kind: 'individual' | 'team';
}
export interface LeagueConfig {
  pointsPerWin: number;
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
    'submitted' | 'approved' | 'disputed' | 'corrected' | 'postponed' | 'rescheduled' | 'cancelled';
  actorId: ID;
  at: string;
  reason?: string;
}
export interface Fixture {
  id: ID;
  seasonId: ID;
  round: number;
  homeId: ID;
  awayId: ID;
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
  seasonId: ID;
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
  version: 1;
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
export interface Standing {
  participantId: ID;
  played: number;
  won: number;
  lost: number;
  points: number;
  framesWon: number;
  framesLost: number;
  difference: number;
  winPercentage: number;
  position: number;
  form: boolean[];
}
