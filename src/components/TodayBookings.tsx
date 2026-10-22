import { Link } from 'react-router-dom';
import { useLeague } from '../app/LeagueContext';
import { useClock } from '../app/useClock';
import {
  bookingDayLabel,
  bookingEnd,
  londonDate,
  londonTime,
  nextAvailableSlot,
  todaysBookings,
} from '../domain/bookings';
import { BookingCard } from './BookingCard';
import { Empty, Section } from './ui';

export function TodayBookings() {
  const { state } = useLeague();
  const now = useClock();
  const bookings = todaysBookings(state.bookings, now).filter(
    (b) => Date.parse(bookingEnd(b)) > now.getTime(),
  );
  const next = nextAvailableSlot(state, now);
  return (
    <Section
      title="Today at the table"
      subtitle="League games and friendly frames · Europe/London"
      link={{ to: '/bookings', label: 'Booking calendar' }}
    >
      <div className="booking-dashboard">
        <div className="booking-availability">
          <span className="eyebrow">NEXT FREE 30 MINUTES</span>
          <strong>{next ? londonTime(next) : 'Fully reserved'}</strong>
          <p>
            {next ? bookingDayLabel(londonDate(next)) : 'Check the calendar for shorter slots.'}
          </p>
          <Link className="button primary" to="/bookings">
            {state.readOnly ? 'View availability' : 'Reserve the table'}
          </Link>
        </div>
        {bookings.slice(0, 2).map((b) => (
          <BookingCard key={b.id} booking={b} now={now} />
        ))}
        {!bookings.length && (
          <Empty title="No more reservations today">
            Find an opening and make time for a game.
          </Empty>
        )}
      </div>
    </Section>
  );
}
