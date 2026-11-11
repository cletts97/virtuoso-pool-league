import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { canEnterLeagueResult, fixtureBooking, personalFixtures } from './personalFixtures';
import { isParticipant } from './rules';
import type { Booking } from './types';

const now = new Date('2026-11-11T10:00:00Z');
function setup() {
  const state = createSeed('2026-11-11');
  const own = state.fixtures
    .filter(
      (f) =>
        f.seasonId === state.selectedSeasonId &&
        isParticipant(f, state.currentUserId, state.participants),
    )
    .slice(0, 4);
  own.forEach((f, i) => {
    f.status = 'scheduled';
    f.score = undefined;
    f.submittedBy = undefined;
    f.dueDate = i === 2 ? '2026-11-02' : '2026-11-09';
  });
  state.fixtures = own;
  const opponent = state.participants.find(
    (p) =>
      [own[0].homeId, own[0].awayId].includes(p.id) && !p.playerIds.includes(state.currentUserId),
  )!.playerIds[0];
  own[0].status = 'pending';
  own[0].submittedBy = opponent;
  own[0].score = { home: 2, away: 1 };
  const booking: Booking = {
    id: 'finished',
    kind: 'league',
    ownerId: state.currentUserId,
    fixtureId: own[1].id,
    duration: 15,
    startAt: '2026-11-11T09:00:00Z',
    status: 'reserved',
    guestIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  state.bookings = [booking];
  return { state, own, booking };
}

describe('personal fixture priorities and eligibility', () => {
  it('prioritizes review, finished booking, overdue, then this week without mutating state', () => {
    const { state, own } = setup();
    const before = structuredClone(state);
    const rows = personalFixtures(state, state.selectedSeasonId, now);
    expect(rows.map((r) => r.fixture.id)).toEqual(own.map((f) => f.id));
    expect(rows.map((r) => r.priority)).toEqual([0, 1, 2, 3]);
    expect(state).toEqual(before);
  });
  it('uses booking end, not start, and allows scoring before it finishes', () => {
    const { state, own } = setup();
    expect(canEnterLeagueResult(state, own[1])).toBe(true);
    expect(
      personalFixtures(state, state.selectedSeasonId, new Date('2026-11-11T09:14:59Z')).find(
        (r) => r.fixture.id === own[1].id,
      )!.finished,
    ).toBe(false);
    expect(
      personalFixtures(state, state.selectedSeasonId, new Date('2026-11-11T09:15:00Z')).find(
        (r) => r.fixture.id === own[1].id,
      )!.finished,
    ).toBe(true);
  });
  it('ignores cancelled bookings and lets replacement reservations supersede finished ones', () => {
    const { state, own, booking } = setup();
    booking.status = 'cancelled';
    expect(fixtureBooking(state, own[1].id, now)).toBeUndefined();
    booking.status = 'reserved';
    state.bookings.push({ ...booking, id: 'replacement', startAt: '2026-11-12T09:00:00Z' });
    expect(fixtureBooking(state, own[1].id, now)!.id).toBe('replacement');
    expect(
      personalFixtures(state, state.selectedSeasonId, now).find((r) => r.fixture.id === own[1].id)!
        .finished,
    ).toBe(false);
  });
  it('does not prompt for completed results, closed seasons, other players or anonymous users', () => {
    const { state, own } = setup();
    own[1].status = 'confirmed';
    own[2].status = 'cancelled';
    expect(personalFixtures(state, state.selectedSeasonId, now)).toHaveLength(2);
    state.seasons.find((s) => s.id === state.selectedSeasonId)!.status = 'complete';
    expect(canEnterLeagueResult(state, own[3])).toBe(false);
    state.currentUserId = 'unrelated';
    expect(personalFixtures(state, state.selectedSeasonId, now)).toEqual([]);
    state.currentUserId = 'p01';
    state.readOnly = true;
    expect(personalFixtures(state, state.selectedSeasonId, now)).toEqual([]);
    expect(canEnterLeagueResult(state, own[3])).toBe(false);
  });
  it('never offers the submitter approval of their own pending score', () => {
    const { state, own } = setup();
    own[0].submittedBy = state.currentUserId;
    const row = personalFixtures(state, state.selectedSeasonId, now).find(
      (r) => r.fixture.id === own[0].id,
    )!;
    expect(row.review).toBe(false);
    expect(row.enter).toBe(false);
  });
});
