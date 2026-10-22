import { recentResults, type RecentResult } from '../domain/recentResults';
import type { BookingConfig, BookingSport, LeagueState } from '../domain/types';
import { bookingEnd, isBookableFixture, todaysBookings } from '../domain/bookings';
import { participantName, standings } from '../domain/rules';

export interface DisplayBooking {
  id: string;
  owner: string;
  participants: string[];
  kind: 'casual' | 'league';
  sport?: BookingSport;
  startAt: string;
  endAt: string;
  duration: number;
}
export interface DisplaySnapshot {
  fetchedAt: string;
  config: BookingConfig;
  bookings: DisplayBooking[];
  season?: { name: string; locked: boolean };
  standings: {
    id: string;
    name: string;
    position: number;
    played: number;
    won: number;
    lost: number;
    difference: number;
    qualifying: boolean;
  }[];
  results: RecentResult[];
  fixtures: { id: string; home: string; away: string; dueDate: string; bookedAt?: string }[];
}
export interface DisplayRepository {
  loadDisplay(): Promise<DisplaySnapshot>;
}

/** Allowlisted public view. Never return identity, email, leave, notes, roles or audit records. */
export function displaySnapshot(state: LeagueState, now = new Date()): DisplaySnapshot {
  // TV follows the most recently started published season, independent of the user's selector.
  const season =
    [...state.seasons]
      .filter((s) => ['regular', 'playoffs'].includes(s.status))
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))[0] ??
    [...state.seasons]
      .filter((s) => s.status === 'complete')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const fixtures = state.fixtures.filter((f) => f.seasonId === season?.id);
  const bookings = todaysBookings(state.bookings, now).filter(
    (b) => Date.parse(bookingEnd(b)) > now.getTime(),
  );
  return {
    fetchedAt: now.toISOString(),
    config: structuredClone(state.bookingConfig),
    bookings: bookings.map((b) => {
      const fixture = state.fixtures.find((f) => f.id === b.fixtureId);
      return {
        id: b.id,
        owner: state.players.find((p) => p.id === b.ownerId)?.name ?? 'Colleague',
        participants: fixture
          ? [participantName(state, fixture.homeId), participantName(state, fixture.awayId)]
          : b.guestIds.map((id) => state.players.find((p) => p.id === id)?.name ?? 'Colleague'),
        kind: b.kind,
        sport: b.sport ?? 'pool',
        startAt: b.startAt,
        endAt: bookingEnd(b),
        duration: b.duration,
      };
    }),
    season: season ? { name: season.name, locked: season.qualifiers.length > 0 } : undefined,
    standings: season
      ? standings(season, fixtures).map((r) => ({
          id: r.participantId,
          name: participantName(state, r.participantId),
          position: r.position,
          played: r.played,
          won: r.won,
          lost: r.lost,
          difference: r.difference,
          qualifying: season.qualifiers.length
            ? season.qualifiers.includes(r.participantId)
            : r.position <= 4,
        }))
      : [],
    results: recentResults(state, 6),
    fixtures: fixtures
      .filter((f) => isBookableFixture(f, state))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map((f) => ({
        id: f.id,
        home: participantName(state, f.homeId),
        away: participantName(state, f.awayId),
        dueDate: f.dueDate,
        bookedAt: state.bookings.find(
          (b) =>
            b.status === 'reserved' &&
            b.fixtureId === f.id &&
            Date.parse(bookingEnd(b)) > now.getTime(),
        )?.startAt,
      })),
  };
}
