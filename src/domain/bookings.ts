import type { Booking, BookingConfig, BookingInput, Fixture, LeagueState } from './types';
import { addDays, invariant, isParticipant, validateDate } from './rules';

export function bookingLabel(booking: Pick<BookingInput, 'kind' | 'sport'>): string {
  return (
    (booking.sport === 'table_tennis' ? 'Table tennis' : 'Pool') +
    ' · ' +
    (booking.kind === 'league' ? 'League match' : 'Casual game')
  );
}
export const BOOKING_DURATIONS = [15, 30] as const;
export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  timeZone: 'Europe/London',
  opensAt: '08:00',
  closesAt: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};
const MINUTE = 60_000;
export function londonDate(at: Date | string = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function londonTime(at: Date | string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
}
export function bookingDayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}
export function timeMinutes(time: string): number {
  invariant(/^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Enter a valid time.');
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
export function minuteTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
/** Europe/London is GMT or BST. Reject skipped/ambiguous wall times instead of guessing. */
export function londonToUtc(date: string, time: string): string {
  validateDate(date);
  timeMinutes(time);
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = [wall, wall - 60 * MINUTE].filter((ms) => {
    const at = new Date(ms);
    return londonDate(at) === date && londonTime(at) === time;
  });
  invariant(
    candidates.length === 1,
    'This London time is ambiguous or unavailable due to daylight saving. Choose another time.',
  );
  return new Date(candidates[0]).toISOString();
}
export function bookingEnd(booking: Pick<BookingInput, 'startAt' | 'duration'>): string {
  return new Date(Date.parse(booking.startAt) + booking.duration * MINUTE).toISOString();
}
export function overlaps(a: BookingInput, b: BookingInput): boolean {
  return (
    Date.parse(a.startAt) < Date.parse(bookingEnd(b)) &&
    Date.parse(b.startAt) < Date.parse(bookingEnd(a))
  );
}
export function validateBookingConfig(config: BookingConfig): void {
  invariant(config.timeZone === 'Europe/London', 'Booking timezone must be Europe/London.');
  const open = timeMinutes(config.opensAt),
    close = timeMinutes(config.closesAt);
  invariant(
    open % 15 === 0 && close % 15 === 0 && close - open >= 15,
    'Office hours must use quarter hours, with closing after opening.',
  );
  invariant(
    config.weekdays.length > 0 &&
      new Set(config.weekdays).size === config.weekdays.length &&
      config.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    'Select at least one valid opening day.',
  );
}
export function withinOfficeHours(input: BookingInput, config: BookingConfig): boolean {
  const date = londonDate(input.startAt);
  return (
    config.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) &&
    londonDate(bookingEnd(input)) === date &&
    londonTime(input.startAt) >= config.opensAt &&
    londonTime(bookingEnd(input)) <= config.closesAt
  );
}
export function isBookableFixture(fixture: Fixture, state: LeagueState): boolean {
  const season = state.seasons.find((s) => s.id === fixture.seasonId);
  return (
    !!season &&
    !['draft', 'complete'].includes(season.status) &&
    !(season.status === 'playoffs' && fixture.stage === 'regular') &&
    ['scheduled', 'postponed'].includes(fixture.status)
  );
}
export function validateBooking(
  state: LeagueState,
  input: BookingInput,
  ownerId: string,
  now: Date,
  excludingId?: string,
): void {
  const start = Date.parse(input.startAt);
  invariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.startAt) &&
      Number.isFinite(start),
    'Use a valid UTC booking start time.',
  );
  invariant(input.duration === 15 || input.duration === 30, 'Choose a 15 or 30-minute booking.');
  invariant(
    start >= now.getTime() && start <= now.getTime() + 7 * 24 * 60 * MINUTE,
    'Bookings must start in the future and within seven days.',
  );
  invariant(start % (15 * MINUTE) === 0, 'Bookings start on a quarter hour.');
  invariant(
    withinOfficeHours(input, state.bookingConfig),
    'Choose a time within office opening hours.',
  );
  invariant(['league', 'casual'].includes(input.kind), 'Choose a booking type.');
  invariant(
    input.sport === undefined || input.sport === 'pool' || input.sport === 'table_tennis',
    'Choose pool or table tennis.',
  );
  invariant(
    input.kind !== 'league' || (input.sport ?? 'pool') === 'pool',
    'League bookings must be for pool.',
  );
  invariant(
    state.players.some((p) => p.id === ownerId && p.active),
    'The booking owner must have an active account.',
  );
  invariant(
    new Set(input.guestIds).size === input.guestIds.length &&
      input.guestIds.every(
        (id) => id !== ownerId && state.players.some((p) => p.id === id && p.active),
      ),
    'Choose distinct active colleagues as participants.',
  );
  if (input.fixtureId) {
    invariant(input.kind === 'league', 'Only league bookings can link to fixtures.');
    const fixture = state.fixtures.find((f) => f.id === input.fixtureId);
    invariant(fixture && isBookableFixture(fixture, state), 'Choose an upcoming league fixture.');
    invariant(
      state.players.find((p) => p.id === ownerId)?.role === 'admin' ||
        isParticipant(fixture, ownerId, state.participants),
      'Only a fixture participant or administrator can reserve this fixture.',
    );
    invariant(
      !state.bookings.some(
        (b) =>
          b.id !== excludingId &&
          b.status === 'reserved' &&
          b.fixtureId === input.fixtureId &&
          Date.parse(bookingEnd(b)) > now.getTime(),
      ),
      'This fixture already has an upcoming reservation. Edit that booking instead.',
    );
  }
  invariant(
    !state.bookings.some(
      (b) => b.id !== excludingId && b.status === 'reserved' && overlaps(input, b),
    ),
    'The table is already reserved during this time. Choose another slot.',
  );
}
/** All open quarter-hour starts for a day, excluding occupied slots and the rolling horizon. */
export function availableSlots(
  state: Pick<LeagueState, 'bookingConfig' | 'bookings'>,
  date: string,
  duration: BookingInput['duration'],
  now: Date,
  excludingId?: string,
): string[] {
  const config = state.bookingConfig;
  if (!config.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) return [];
  const starts: string[] = [];
  for (
    let minutes = timeMinutes(config.opensAt);
    minutes + duration <= timeMinutes(config.closesAt);
    minutes += 15
  ) {
    let startAt: string;
    try {
      startAt = londonToUtc(date, minuteTime(minutes));
    } catch {
      continue;
    }
    const start = Date.parse(startAt);
    const input: BookingInput = { startAt, duration, kind: 'casual', guestIds: [] };
    if (
      start >= now.getTime() &&
      start <= now.getTime() + 7 * 86400000 &&
      !state.bookings.some(
        (b) => b.id !== excludingId && b.status === 'reserved' && overlaps(input, b),
      )
    )
      starts.push(startAt);
  }
  return starts;
}
export function nextAvailableSlot(
  state: Pick<LeagueState, 'bookingConfig' | 'bookings'>,
  now: Date,
): string | undefined {
  for (let day = 0; day <= 7; day++) {
    const slot = availableSlots(state, addDays(londonDate(now), day), 30, now)[0];
    if (slot) return slot;
  }
}
export function todaysBookings(bookings: Booking[], now: Date): Booking[] {
  return bookings
    .filter((b) => b.status === 'reserved' && londonDate(b.startAt) === londonDate(now))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
