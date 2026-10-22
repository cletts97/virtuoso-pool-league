import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { bookingEnd, bookingLabel, londonTime } from '../domain/bookings';
import { participantName } from '../domain/rules';
import type { Booking } from '../domain/types';
import { Avatar } from './ui';

export function BookingCard({
  booking,
  now,
  onEdit,
  onCancel,
}: {
  booking: Booking;
  now: Date;
  onEdit?(booking: Booking): void;
  onCancel?(booking: Booking): void;
}) {
  const { state } = useLeague();
  const owner = state.players.find((p) => p.id === booking.ownerId);
  const fixture = state.fixtures.find((f) => f.id === booking.fixtureId);
  const end = bookingEnd(booking);
  const past = Date.parse(end) <= now.getTime();
  const live =
    !past && Date.parse(booking.startAt) <= now.getTime() && booking.status === 'reserved';
  const canManage =
    state.currentUserId === booking.ownerId ||
    state.players.find((p) => p.id === state.currentUserId)?.role === 'admin';
  const names = fixture
    ? `${participantName(state, fixture.homeId)} v ${participantName(state, fixture.awayId)}`
    : booking.guestIds
        .map((id) => state.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(', ');
  return (
    <article
      className={`booking-card ${booking.kind} ${live ? 'is-live' : ''} ${booking.status === 'cancelled' ? 'is-cancelled' : ''}`}
    >
      <div className="booking-card-top">
        <span className="eyebrow">{bookingLabel(booking)}</span>
        <span className={live ? 'positive' : 'muted'}>
          {booking.status === 'cancelled'
            ? 'Cancelled'
            : live
              ? 'On the table'
              : past
                ? 'Finished'
                : 'Reserved'}
        </span>
      </div>
      <div className="booking-owner">
        <Avatar id={booking.ownerId} />
        <div>
          <h3>{owner?.name ?? 'Colleague'}</h3>
          {names && <p>{names}</p>}
        </div>
      </div>
      <p className="booking-time">
        <Clock3 size={15} />
        {londonTime(booking.startAt)}–{londonTime(end)}
        <span>· {booking.duration} min</span>
      </p>
      {fixture && (
        <Link className="text-link" to={`/fixtures/${fixture.id}`}>
          View league fixture
        </Link>
      )}
      {canManage && !past && booking.status === 'reserved' && onCancel && (
        <div className="booking-actions">
          {!live && onEdit && (
            <button className="button secondary small" onClick={() => onEdit(booking)}>
              Edit reservation
            </button>
          )}
          <button className="button secondary small" onClick={() => onCancel(booking)}>
            Cancel reservation
          </button>
        </div>
      )}
    </article>
  );
}
