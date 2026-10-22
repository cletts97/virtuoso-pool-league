import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { executeBookingCommand } from '../data/bookingCommands';
import { displaySnapshot } from '../data/display';
import { migrateDemoState } from '../data/migrations';
import { LocalLeagueRepository, STORAGE_KEY } from '../data/localRepository';
import { standings } from './rules';
import {
  availableSlots,
  bookingEnd,
  DEFAULT_BOOKING_CONFIG,
  londonDate,
  londonTime,
  londonToUtc,
  validateBooking,
  validateBookingConfig,
} from './bookings';
import type { BookingInput } from './types';

const now = new Date('2026-10-20T08:00:00Z'); // Tuesday, 09:00 BST
function scenario() {
  const state = createSeed('2026-10-20');
  state.bookings = [];
  state.currentUserId = 'colleague-01';
  const input: BookingInput = {
    kind: 'casual',
    startAt: londonToUtc('2026-10-20', '11:00'),
    duration: 30,
    guestIds: ['p02'],
  };
  return { state, input };
}
describe('London booking time and availability', () => {
  it('converts winter/summer and both sides of the autumn transition independently of device timezone', () => {
    expect(londonToUtc('2026-07-01', '10:00')).toBe('2026-07-01T09:00:00.000Z');
    expect(londonToUtc('2026-12-01', '10:00')).toBe('2026-12-01T10:00:00.000Z');
    expect(londonToUtc('2026-10-23', '10:00')).toBe('2026-10-23T09:00:00.000Z');
    expect(londonToUtc('2026-10-26', '10:00')).toBe('2026-10-26T10:00:00.000Z');
    expect(londonDate('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(londonTime('2026-07-01T23:30:00Z')).toBe('00:30');
  });
  it('rejects skipped and ambiguous daylight-saving times', () => {
    expect(() => londonToUtc('2026-03-29', '01:30')).toThrow('daylight saving');
    expect(() => londonToUtc('2026-10-25', '01:30')).toThrow('daylight saving');
    expect(() => londonToUtc('2026-02-30', '12:00')).toThrow();
  });
  it.each([15, 30] as const)('allows a %i-minute reservation', (duration) => {
    const { state, input } = scenario();
    expect(() =>
      validateBooking(state, { ...input, duration }, state.currentUserId, now),
    ).not.toThrow();
  });
  it.each([
    { startAt: 'not-a-date' },
    { startAt: '2026-10-20T10:00:00+01:00' },
    { startAt: '2026-10-20T07:45:00Z' },
    { startAt: '2026-10-20T10:07:00Z' },
    { startAt: '2026-10-28T10:00:00Z' },
    { startAt: '2026-10-24T10:00:00Z' },
    { startAt: '2026-10-20T16:45:00Z', duration: 30 },
    { duration: 45 },
    { duration: 60 },
  ])('rejects invalid, past, off-grid, out-of-window and closed times: %j', (patch) => {
    const { state, input } = scenario();
    expect(() =>
      validateBooking(state, { ...input, ...patch } as BookingInput, state.currentUserId, now),
    ).toThrow();
  });
  it('allows closing-time boundaries and exactly seven days, but not one quarter hour beyond', () => {
    const { state, input } = scenario();
    validateBooking(
      state,
      { ...input, startAt: londonToUtc('2026-10-20', '17:30') },
      state.currentUserId,
      now,
    );
    validateBooking(state, { ...input, startAt: '2026-10-27T08:00:00Z' }, state.currentUserId, now);
    expect(() =>
      validateBooking(
        state,
        { ...input, startAt: '2026-10-27T08:15:00Z' },
        state.currentUserId,
        now,
      ),
    ).toThrow('seven days');
  });
  it('removes overlapping slots while preserving adjacent slots and ignoring cancelled bookings', () => {
    const { state, input } = scenario();
    const booked = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    const slots = availableSlots(booked, '2026-10-20', 30, now);
    expect(slots).not.toContain(londonToUtc('2026-10-20', '10:45'));
    expect(slots).not.toContain(input.startAt);
    expect(slots).toContain(londonToUtc('2026-10-20', '10:30'));
    expect(slots).toContain(bookingEnd(input));
    expect(availableSlots(booked, '2026-10-24', 30, now)).toEqual([]);
    expect(availableSlots(booked, '2026-10-20', 30, now, booked.bookings[0].id)).toContain(
      input.startAt,
    );
    booked.bookings[0].status = 'cancelled';
    expect(availableSlots(booked, '2026-10-20', 30, now)).toContain(input.startAt);
  });
  it('validates configurable office hours and days', () => {
    for (const patch of [
      { opensAt: '18:00' },
      { closesAt: '07:00' },
      { weekdays: [] },
      { weekdays: [8] },
      { weekdays: [1, 1] },
      { opensAt: '08:07' },
    ])
      expect(() => validateBookingConfig({ ...DEFAULT_BOOKING_CONFIG, ...patch })).toThrow();
    expect(() =>
      validateBookingConfig({ ...DEFAULT_BOOKING_CONFIG, weekdays: [0, 6] }),
    ).not.toThrow();
  });
});
describe('booking commands and membership', () => {
  it('lets a non-league colleague book, edit and cancel without changing league data', () => {
    const { state, input } = scenario();
    expect(state.participants.some((p) => p.playerIds.includes(state.currentUserId))).toBe(false);
    const before = standings(state.seasons[0], state.fixtures);
    let next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    const id = next.bookings[0].id;
    next = executeBookingCommand(
      next,
      { type: 'saveBooking', id, booking: { ...input, duration: 15 } },
      now,
    );
    expect(next.bookings[0].duration).toBe(15);
    next = executeBookingCommand(next, { type: 'cancelBooking', id }, now);
    expect(next.bookings[0].status).toBe('cancelled');
    expect(next.fixtures).toEqual(state.fixtures);
    expect(standings(next.seasons[0], next.fixtures)).toEqual(before);
    expect(state.bookings).toEqual([]);
  });
  it('preserves existing 60-minute reservations and allows their cancellation', () => {
    const { state, input } = scenario();
    const next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    next.bookings[0].duration = 60;
    expect(bookingEnd(next.bookings[0])).toBe(londonToUtc('2026-10-20', '12:00'));
    expect(
      executeBookingCommand(next, { type: 'cancelBooking', id: next.bookings[0].id }, now)
        .bookings[0].status,
    ).toBe('cancelled');
  });
  it('rejects collisions, including enclosing reservations', () => {
    const { state, input } = scenario();
    const next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    for (const start of ['10:45', '11:00', '11:15'])
      expect(() =>
        executeBookingCommand(
          next,
          {
            type: 'saveBooking',
            booking: { ...input, startAt: londonToUtc('2026-10-20', start), duration: 30 },
          },
          now,
        ),
      ).toThrow('already reserved');
    expect(next.bookings).toHaveLength(1);
  });
  it('prevents other users editing/cancelling, while allowing admin and preserving ownership', () => {
    const { state, input } = scenario();
    let next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    const id = next.bookings[0].id;
    next.currentUserId = 'p02';
    expect(() => executeBookingCommand(next, { type: 'cancelBooking', id }, now)).toThrow(
      'Only the owner',
    );
    expect(() =>
      executeBookingCommand(next, { type: 'saveBooking', id, booking: input }, now),
    ).toThrow('Only the owner');
    next.currentUserId = 'p01';
    next = executeBookingCommand(
      next,
      { type: 'saveBooking', id, booking: { ...input, duration: 15 } },
      now,
    );
    expect(next.bookings[0].ownerId).toBe('colleague-01');
    expect(executeBookingCommand(next, { type: 'cancelBooking', id }, now).bookings[0].status).toBe(
      'cancelled',
    );
  });
  it('requires active accounts and valid guests', () => {
    const { state, input } = scenario();
    expect(() =>
      executeBookingCommand(
        state,
        { type: 'saveBooking', booking: { ...input, guestIds: ['missing'] } },
        now,
      ),
    ).toThrow('active colleagues');
    state.players.find((p) => p.id === state.currentUserId)!.active = false;
    expect(() =>
      executeBookingCommand(state, { type: 'saveBooking', booking: input }, now),
    ).toThrow('active demo');
  });
  it('links only eligible fixtures, prevents duplicates and clears links on conversion to casual', () => {
    const { state, input } = scenario();
    const fixture = state.fixtures.find((f) => f.status === 'scheduled')!;
    const league = { ...input, kind: 'league' as const, fixtureId: fixture.id };
    expect(() =>
      executeBookingCommand(state, { type: 'saveBooking', booking: league }, now),
    ).toThrow('fixture participant');
    state.currentUserId = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
    league.guestIds = [];
    let next = executeBookingCommand(state, { type: 'saveBooking', booking: league }, now);
    expect(() =>
      executeBookingCommand(
        next,
        { type: 'saveBooking', booking: { ...league, startAt: bookingEnd(input) } },
        now,
      ),
    ).toThrow('already has an upcoming');
    next = executeBookingCommand(
      next,
      { type: 'saveBooking', id: next.bookings[0].id, booking: { ...input, guestIds: [] } },
      now,
    );
    expect(next.bookings[0].fixtureId).toBeUndefined();
    fixture.status = 'confirmed';
    expect(() =>
      executeBookingCommand(state, { type: 'saveBooking', booking: league }, now),
    ).toThrow('upcoming league fixture');
  });
  it('allows cancellation during play but never moving or changing finished/cancelled reservations', () => {
    const { state, input } = scenario();
    const next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    const id = next.bookings[0].id;
    expect(() =>
      executeBookingCommand(
        next,
        { type: 'saveBooking', id, booking: input },
        new Date(input.startAt),
      ),
    ).toThrow('has started');
    expect(
      executeBookingCommand(next, { type: 'cancelBooking', id }, new Date(input.startAt))
        .bookings[0].status,
    ).toBe('cancelled');
    expect(() =>
      executeBookingCommand(next, { type: 'cancelBooking', id }, new Date(bookingEnd(input))),
    ).toThrow('Completed');
    next.bookings[0].status = 'cancelled';
    expect(() => executeBookingCommand(next, { type: 'cancelBooking', id }, now)).toThrow(
      'already been cancelled',
    );
  });
  it('only admins configure hours and cannot invalidate future bookings', () => {
    const { state, input } = scenario();
    const next = executeBookingCommand(state, { type: 'saveBooking', booking: input }, now);
    const command = {
      type: 'bookingConfig' as const,
      config: { ...DEFAULT_BOOKING_CONFIG, closesAt: '10:00' },
    };
    expect(() => executeBookingCommand(next, command, now)).toThrow();
    next.currentUserId = 'p01';
    expect(() => executeBookingCommand(next, command, now)).toThrow('conflict');
    expect(
      executeBookingCommand(
        next,
        { ...command, config: { ...command.config, closesAt: '17:00' } },
        now,
      ).bookingConfig.closesAt,
    ).toBe('17:00');
  });
});
describe('booking persistence and TV read model', () => {
  it('migrates an existing v2 save without inventing bookings or changing league records', () => {
    const state = createSeed('2026-10-20');
    const legacy = {
      ...state,
      version: 2 as const,
      bookings: undefined,
      bookingConfig: undefined,
      players: state.players.filter((p) => p.role !== 'colleague'),
    };
    const next = migrateDemoState(legacy);
    expect(next.version).toBe(3);
    expect(next.bookings).toEqual([]);
    expect(next.fixtures).toEqual(state.fixtures);
    expect(next.participants).toEqual(state.participants);
    expect(next.players.filter((p) => p.role === 'colleague')).toHaveLength(1);
    expect(migrateDemoState(next)).toBe(next);
  });
  it('persists reservations across repository instances and detects another-tab conflict on save', async () => {
    const { state, input } = scenario();
    // Repository clocks use real time; pick a future available opening from the live seed.
    const live = createSeed();
    live.currentUserId = state.currentUserId;
    live.bookings = [];
    let raw = JSON.stringify(live);
    const storage = {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        raw = value;
      },
    };
    const repo = new LocalLeagueRepository(storage);
    const { nextAvailableSlot } = await import('./bookings');
    input.startAt = nextAvailableSlot(live, new Date())!;
    const saved = await repo.execute({ type: 'saveBooking', booking: input });
    const another = new LocalLeagueRepository(storage);
    expect((await another.load()).bookings).toEqual(saved.bookings);
    await expect(another.execute({ type: 'saveBooking', booking: input })).rejects.toThrow(
      'already reserved',
    );
    expect(JSON.parse(storage.getItem()).bookings).toHaveLength(1);
    expect(STORAGE_KEY).toBe('virtuoso-pool-league.v1');
  });
  it('exposes only allowlisted TV information, independent of selected user and archived season', () => {
    const state = createSeed('2026-10-20');
    const before = displaySnapshot(state, now);
    state.selectedSeasonId = 'summer-2026';
    state.currentUserId = 'colleague-01';
    expect(displaySnapshot(state, now)).toEqual(before);
    expect(before.season?.name).toBe('Autumn League 2026');
    expect(before.bookings).toHaveLength(3);
    const json = JSON.stringify(before);
    for (const key of [
      'currentUserId',
      'email',
      'department',
      'notifications',
      'availability',
      'history',
      'submittedBy',
    ])
      expect(json).not.toContain(`"${key}"`);
    expect(before.results.every((r) => r.homeScore === 2 || r.awayScore === 2)).toBe(true);
  });
  it('drops cancelled/finished bookings and rolls the display into a new London day', () => {
    const state = createSeed('2026-10-20');
    state.bookings[1].status = 'cancelled';
    expect(displaySnapshot(state, new Date('2026-10-20T10:00:00Z')).bookings).toHaveLength(1);
    expect(displaySnapshot(state, new Date('2026-10-21T09:00:00Z')).bookings).toEqual([]);
  });
});
