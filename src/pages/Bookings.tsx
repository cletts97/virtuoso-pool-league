import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Monitor, Settings2 } from 'lucide-react';
import { useLeague } from '../app/LeagueContext';
import { useClock } from '../app/useClock';
import { addDays } from '../domain/rules';
import { availableSlots, bookingDayLabel, londonDate, londonTime } from '../domain/bookings';
import type { Booking, BookingInput } from '../domain/types';
import { Confirm, Empty, PageHeading, Section } from '../components/ui';
import { BookingForm } from '../components/BookingForm';
import { BookingCard } from '../components/BookingCard';
import { BookingSettings } from '../components/BookingSettings';

export function Bookings() {
  const { state, run } = useLeague();
  const [search, setSearch] = useSearchParams();
  const now = useClock(),
    today = londonDate(now);
  const [selected, setSelected] = useState(today);
  const date = selected < today ? today : selected;
  const [filter, setFilter] = useState('all');
  const [duration, setDuration] = useState<BookingInput['duration']>(30);
  const [form, setForm] = useState<Booking | 'new'>();
  const [slot, setSlot] = useState<string>();
  const [cancel, setCancel] = useState<Booking>();
  const [settings, setSettings] = useState(false);
  const admin = state.players.find((p) => p.id === state.currentUserId)?.role === 'admin';
  const fixtureId = search.get('fixture') ?? undefined;
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));
  const bookings = state.bookings
    .filter(
      (b) =>
        londonDate(b.startAt) === date &&
        (filter === 'mine'
          ? b.ownerId === state.currentUserId
          : filter === 'cancelled'
            ? b.status === 'cancelled'
            : b.status === 'reserved'),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const slots = availableSlots(state, date, duration, now);
  function closeForm() {
    setForm(undefined);
    setSlot(undefined);
    if (fixtureId) setSearch({}, { replace: true });
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE TIME FOR A GAME"
        title="The table is yours."
        description="League rivals or a friendly frame. Reserve a little time together."
        action={
          state.readOnly ? (
            <Link className="button primary" to="/login" state={{ from: '/bookings' }}>
              Sign in to book
            </Link>
          ) : (
            <button className="button primary" onClick={() => setForm('new')}>
              <CalendarPlus size={17} />
              Reserve the table
            </button>
          )
        }
      />
      <div className="booking-toolbar">
        <p>
          One shared table · {state.bookingConfig.opensAt}–{state.bookingConfig.closesAt} ·
          Europe/London
        </p>
        <div>
          <Link to="/display" target="_blank" className="button secondary">
            <Monitor size={16} />
            Open TV display
          </Link>
          {admin && (
            <button className="button secondary" onClick={() => setSettings(true)}>
              <Settings2 size={16} />
              Opening hours
            </button>
          )}
        </div>
      </div>
      <section className="panel booking-calendar" aria-label="Booking calendar">
        <div className="section-heading">
          <div>
            <h2>Find your next frame</h2>
            <p>Today and the next seven days · Bookings open on a rolling seven-day basis</p>
          </div>
        </div>
        <div className="booking-days">
          {days.map((day) => {
            const count = state.bookings.filter(
              (b) => londonDate(b.startAt) === day && b.status === 'reserved',
            ).length;
            const closed = !state.bookingConfig.weekdays.includes(
              new Date(`${day}T12:00:00Z`).getUTCDay(),
            );
            return (
              <button
                key={day}
                className={date === day ? 'selected' : ''}
                aria-pressed={date === day}
                onClick={() => setSelected(day)}
              >
                <span>{day === today ? 'Today' : bookingDayLabel(day).split(',')[0]}</span>
                <strong>{Number(day.slice(-2))}</strong>
                <small>{closed ? 'Closed' : count ? `${count} reserved` : 'Wide open'}</small>
              </button>
            );
          })}
        </div>
      </section>
      <div className="booking-columns">
        <Section
          title={bookingDayLabel(date)}
          subtitle="Reservations for the whole office, across all seasons."
        >
          <div className="booking-filter">
            <label>
              Show reservations
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All reservations</option>
                {!state.readOnly && <option value="mine">My reservations</option>}
                {!state.readOnly && <option value="cancelled">Cancelled reservations</option>}
              </select>
            </label>
          </div>
          <div className="booking-list">
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} now={now} onEdit={setForm} onCancel={setCancel} />
            ))}
          </div>
          {!bookings.length && (
            <Empty title="No reservations here">
              {filter === 'all'
                ? 'Choose an available time to make your next game happen.'
                : 'Try another day or view all reservations.'}
            </Empty>
          )}
        </Section>
        <Section title="Room for a game" subtitle="Available start times · Europe/London">
          <div className="booking-filter">
            <label>
              Find a slot
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as BookingInput['duration'])}
              >
                {[15, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="availability-slots">
            {slots.map((slot) => (
              <button
                key={slot}
                disabled={state.readOnly}
                title={state.readOnly ? 'Sign in to reserve this time' : undefined}
                onClick={() => {
                  setSlot(slot);
                  setForm('new');
                }}
              >
                {londonTime(slot)}
              </button>
            ))}
          </div>
          {!slots.length && (
            <Empty title="No slots available">
              The table is closed, fully reserved, or outside the booking window. Try another day.
            </Empty>
          )}
          <p className="panel-footnote">
            A table reservation is optional for league matches. Casual games never change league
            standings.
          </p>
        </Section>
      </div>
      {!state.readOnly && (form || fixtureId) && (
        <BookingForm
          booking={typeof form === 'object' ? form : undefined}
          initialDate={date}
          initialStart={slot}
          initialDuration={slot ? duration : undefined}
          fixtureId={fixtureId}
          onClose={closeForm}
        />
      )}
      {cancel && (
        <Confirm
          title="Cancel this reservation?"
          label="Cancel reservation"
          onClose={() => setCancel(undefined)}
          onConfirm={() => {
            void run(
              { type: 'cancelBooking', id: cancel.id },
              'Reservation cancelled. The slot is available again.',
            ).then((ok) => {
              if (ok) setCancel(undefined);
            });
          }}
        >
          The table will be released for {londonTime(cancel.startAt)} on{' '}
          {bookingDayLabel(londonDate(cancel.startAt))}.
        </Confirm>
      )}
      {settings && <BookingSettings onClose={() => setSettings(false)} />}
    </>
  );
}
