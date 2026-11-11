import type { Fixture, LeagueState } from './types';
import { bookingEnd, isBookableFixture } from './bookings';
import { canApprove, dateOnly, isParticipant, weekStart } from './rules';

export function canEnterLeagueResult(state: LeagueState, fixture: Fixture) {
  return (
    !state.readOnly &&
    !!state.players.find((p) => p.id === state.currentUserId && p.active) &&
    isParticipant(fixture, state.currentUserId, state.participants) &&
    isBookableFixture(fixture, state)
  );
}

/** A replacement reservation supersedes an older finished one; cancelled slots never prompt. */
export function fixtureBooking(state: LeagueState, fixtureId: string, now: Date) {
  const bookings = state.bookings
    .filter((b) => b.kind === 'league' && b.fixtureId === fixtureId && b.status === 'reserved')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return bookings.find((b) => Date.parse(bookingEnd(b)) > now.getTime()) ?? bookings.at(-1);
}

export function personalFixtures(state: LeagueState, seasonId: string, now: Date) {
  if (state.readOnly || !state.players.some((p) => p.id === state.currentUserId && p.active))
    return [];
  const week = weekStart(dateOnly(now));
  return state.fixtures
    .filter(
      (f) =>
        f.seasonId === seasonId &&
        isParticipant(f, state.currentUserId, state.participants) &&
        !['confirmed', 'cancelled'].includes(f.status),
    )
    .map((fixture) => {
      const booking = fixtureBooking(state, fixture.id, now);
      const review = canApprove(fixture, state.currentUserId, state.participants);
      const enter = canEnterLeagueResult(state, fixture);
      const finished = enter && !!booking && Date.parse(bookingEnd(booking)) <= now.getTime();
      const overdue = enter && weekStart(fixture.dueDate) < week;
      const thisWeek = weekStart(fixture.dueDate) === week;
      const priority = review
        ? 0
        : finished
          ? 1
          : overdue
            ? 2
            : thisWeek
              ? 3
              : fixture.status === 'pending' || fixture.status === 'disputed'
                ? 4
                : 5;
      return { fixture, booking, review, enter, finished, overdue, thisWeek, priority };
    })
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.fixture.dueDate.localeCompare(b.fixture.dueDate) ||
        a.fixture.id.localeCompare(b.fixture.id),
    );
}
