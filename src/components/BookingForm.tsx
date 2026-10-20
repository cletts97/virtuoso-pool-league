import { useState } from 'react';
import { useLeague } from '../app/LeagueContext';
import { useClock } from '../app/useClock';
import {
  availableSlots,
  BOOKING_DURATIONS,
  bookingDayLabel,
  isBookableFixture,
  londonDate,
  londonTime,
} from '../domain/bookings';
import { addDays, isParticipant, participantName } from '../domain/rules';
import type { Booking, BookingInput } from '../domain/types';
import { Modal } from './ui';

export function BookingForm({
  booking,
  initialDate,
  initialStart,
  initialDuration,
  fixtureId,
  onClose,
}: {
  booking?: Booking;
  initialDate: string;
  initialStart?: string;
  initialDuration?: BookingInput['duration'];
  fixtureId?: string;
  onClose(): void;
}) {
  const { state, run, busy } = useLeague();
  const now = useClock();
  const [kind, setKind] = useState<BookingInput['kind']>(
    booking?.kind ?? (fixtureId ? 'league' : 'casual'),
  );
  const [date, setDate] = useState(booking ? londonDate(booking.startAt) : initialDate);
  const [duration, setDuration] = useState<BookingInput['duration']>(
    booking?.duration ?? initialDuration ?? 30,
  );
  const [start, setStart] = useState(booking?.startAt ?? initialStart ?? '');
  const [linked, setLinked] = useState(booking?.fixtureId ?? fixtureId ?? '');
  const [guestIds, setGuests] = useState(booking?.guestIds ?? []);
  const ownerId = booking?.ownerId ?? state.currentUserId;
  const owner = state.players.find((p) => p.id === ownerId)!;
  const slots = availableSlots(state, date, duration, now, booking?.id);
  const fixtures = state.fixtures.filter(
    (f) =>
      isBookableFixture(f, state) &&
      (owner.role === 'admin' || isParticipant(f, ownerId, state.participants)),
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const saved = await run(
      {
        type: 'saveBooking',
        id: booking?.id,
        booking: {
          kind,
          duration,
          startAt: start,
          guestIds: kind === 'league' && linked ? [] : guestIds,
          fixtureId: kind === 'league' && linked ? linked : undefined,
        },
      },
      booking ? 'Reservation updated.' : 'The table is reserved. Enjoy your game!',
    );
    if (saved) onClose();
  }
  return (
    <Modal title={booking ? 'Edit reservation' : 'Reserve the table'} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="form-stack">
        <p className="field-help">
          Booked by {owner.name} · All times Europe/London. Reserve up to seven days ahead.
        </p>
        <label>
          Booking type
          <select value={kind} onChange={(e) => setKind(e.target.value as BookingInput['kind'])}>
            <option value="casual">Casual game</option>
            <option value="league">League match</option>
          </select>
        </label>
        {kind === 'league' && (
          <label>
            League fixture (optional)
            <select value={linked} onChange={(e) => setLinked(e.target.value)}>
              <option value="">No linked fixture</option>
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {participantName(state, f.homeId)} v {participantName(state, f.awayId)} ·{' '}
                  {state.seasons.find((s) => s.id === f.seasonId)?.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-grid">
          <label>
            Booking date
            <input
              required
              type="date"
              min={londonDate(now)}
              max={addDays(londonDate(now), 7)}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setStart('');
              }}
            />
          </label>
          <label>
            Duration
            <select
              value={duration}
              onChange={(e) => {
                setDuration(Number(e.target.value) as BookingInput['duration']);
                setStart('');
              }}
            >
              {BOOKING_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Available start time
          <select
            required
            value={slots.includes(start) ? start : ''}
            onChange={(e) => setStart(e.target.value)}
          >
            <option value="">Choose an available time</option>
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {londonTime(slot)}
              </option>
            ))}
          </select>
        </label>
        {date && !slots.length && (
          <p className="form-error" role="status">
            No available slots on {bookingDayLabel(date)} for this duration. Choose another date or
            duration.
          </p>
        )}
        {!(kind === 'league' && linked) && (
          <fieldset className="booking-guests">
            <legend>Playing with (optional)</legend>
            {state.players
              .filter((p) => p.active && p.id !== ownerId)
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={guestIds.includes(p.id)}
                    onChange={(e) =>
                      setGuests(
                        e.target.checked
                          ? [...guestIds, p.id]
                          : guestIds.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
          </fieldset>
        )}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !slots.includes(start)}>
            {booking ? 'Save reservation' : 'Confirm reservation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
