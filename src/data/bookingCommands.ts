import type { BookingConfig, BookingInput, LeagueState } from '../domain/types';
import { invariant, requireAdmin } from '../domain/rules';
import {
  bookingEnd,
  validateBooking,
  validateBookingConfig,
  withinOfficeHours,
} from '../domain/bookings';

export type BookingCommand =
  | { type: 'saveBooking'; id?: string; booking: BookingInput }
  | { type: 'cancelBooking'; id: string }
  | { type: 'bookingConfig'; config: BookingConfig };

export function executeBookingCommand(
  source: LeagueState,
  command: BookingCommand,
  now = new Date(),
): LeagueState {
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(actor?.active, 'Select an active demo user.');
  if (command.type === 'bookingConfig') {
    requireAdmin(actor);
    validateBookingConfig(command.config);
    invariant(
      state.bookings
        .filter((b) => b.status === 'reserved' && Date.parse(bookingEnd(b)) > now.getTime())
        .every((b) => withinOfficeHours(b, command.config)),
      'These hours conflict with an existing reservation. Move or cancel it first.',
    );
    state.bookingConfig = command.config;
    return state;
  }
  const existing = command.id ? state.bookings.find((b) => b.id === command.id) : undefined;
  if (command.id) {
    invariant(existing, 'Booking not found.');
    invariant(
      existing.ownerId === actor.id || actor.role === 'admin',
      'Only the owner or an administrator can manage this booking.',
    );
    invariant(existing.status === 'reserved', 'This booking has already been cancelled.');
    invariant(
      Date.parse(bookingEnd(existing)) > now.getTime(),
      'Completed bookings cannot be changed.',
    );
  }
  if (command.type === 'cancelBooking') {
    invariant(existing, 'Booking not found.');
    existing.status = 'cancelled';
    existing.updatedAt = now.toISOString();
    return state;
  }
  invariant(
    !existing || Date.parse(existing.startAt) > now.getTime(),
    'A booking that has started can be cancelled, but cannot be moved.',
  );
  validateBooking(state, command.booking, existing?.ownerId ?? actor.id, now, existing?.id);
  const values = {
    ...command.booking,
    startAt: new Date(command.booking.startAt).toISOString(),
    updatedAt: now.toISOString(),
  };
  if (existing) {
    // Remove a prior fixture link when converting to a casual reservation.
    existing.fixtureId = undefined;
    Object.assign(existing, values);
  } else {
    state.bookings.push({
      ...values,
      id: crypto.randomUUID(),
      ownerId: actor.id,
      status: 'reserved',
      createdAt: now.toISOString(),
    });
  }
  return state;
}
