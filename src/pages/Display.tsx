import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BookOpen, Clock3, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useClock } from '../app/useClock';
import { liveMode } from '../auth/client';
import { browserRepository } from '../data/browserRepository';
import type { DisplaySnapshot } from '../data/display';
import { bookingDayLabel, londonDate, londonTime } from '../domain/bookings';

const bookingUrl = new URL(
  '/bookings',
  import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin,
).href;

export function Display() {
  const [data, setData] = useState<DisplaySnapshot>();
  const [error, setError] = useState('');
  const now = useClock();
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await browserRepository.loadDisplay();
        if (alive) {
          setData(next);
          setError('');
        }
      } catch {
        if (alive) setError('Live data unavailable · Automatically retrying');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const refreshEvent = () => void refresh();
    window.addEventListener('storage', refreshEvent);
    window.addEventListener('focus', refreshEvent);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('storage', refreshEvent);
      window.removeEventListener('focus', refreshEvent);
    };
  }, []);
  const bookings =
    data?.bookings.filter(
      (b) => Date.parse(b.endAt) > now.getTime() && londonDate(b.startAt) === londonDate(now),
    ) ?? [];
  const current = bookings.find((b) => Date.parse(b.startAt) <= now.getTime());
  const upcoming = bookings.filter((b) => Date.parse(b.startAt) > now.getTime());
  // Page long queues automatically; no reservation is hidden indefinitely.
  // Long names need more lines. Rotate fewer reservations instead of clipping their text.
  const queueSize = upcoming.some((b) => b.owner.length + b.participants.join(' · ').length > 80)
    ? 2
    : 3;
  const pageCount = Math.max(1, Math.ceil(upcoming.length / queueSize));
  const queuePage = Math.floor(now.getTime() / 15000) % pageCount;
  const config = data?.config;
  const open =
    config &&
    config.weekdays.includes(new Date(`${londonDate(now)}T12:00:00Z`).getUTCDay()) &&
    londonTime(now) >= config.opensAt &&
    londonTime(now) < config.closesAt;
  const stale = !!error || (!!data && now.getTime() - Date.parse(data.fetchedAt) > 90_000);
  return (
    <main className="tv-display" data-theme="dark">
      <header className="tv-header">
        <div className="tv-brand">
          <img src="/brand/virtuoso-white.png" alt="Virtuoso" />
          <span>
            POOL LEAGUE <i /> THE TABLE LIVE
          </span>
        </div>
        <div className="tv-header-actions">
          <Link className="button secondary tv-rules-link" to="/">
            Dashboard
          </Link>
          <Link className="button secondary tv-rules-link" to="/rules?from=display">
            <BookOpen size={20} />
            Rules
          </Link>
          <div className="tv-clock">
            <strong>{londonTime(now)}</strong>
            <span>{bookingDayLabel(londonDate(now))} · London</span>
          </div>
        </div>
      </header>
      <div className="tv-grid">
        <section className={`tv-current ${current ? 'occupied' : ''}`}>
          <div className="eyebrow">
            <span className="live-dot" />
            {stale
              ? 'UPDATES INTERRUPTED'
              : current
                ? 'ON THE TABLE'
                : open
                  ? 'TABLE AVAILABLE'
                  : 'OUTSIDE OFFICE HOURS'}
          </div>
          <h1 className={current && current.owner.length > 28 ? 'tv-long-name' : undefined}>
            {!data
              ? 'Loading table information…'
              : stale
                ? 'Checking availability…'
                : current
                  ? current.owner
                  : open
                    ? 'The table is free.'
                    : 'Outside office hours'}
          </h1>
          {current ? (
            <>
              <p className="tv-game-type">
                {current.kind === 'league' ? 'League match' : 'Casual game'}
              </p>
              {current.participants.length > 0 && (
                <p className="tv-participants">
                  {current.participants.join(current.kind === 'league' ? ' v ' : ' · ')}
                </p>
              )}
              <div className="tv-countdown">
                <strong>
                  {Math.max(0, Math.ceil((Date.parse(current.endAt) - now.getTime()) / 60000))}
                </strong>
                <span>
                  minutes remaining
                  <br />
                  {londonTime(current.startAt)}–{londonTime(current.endAt)}
                </span>
              </div>
            </>
          ) : (
            <>
              <p>
                {upcoming[0]
                  ? `Next reservation at ${londonTime(upcoming[0].startAt)}`
                  : 'No more reservations today.'}
              </p>
              <div className="tv-free-ball" aria-hidden="true">
                8
              </div>
            </>
          )}
          <div className="tv-current-foot">
            {config ? `Office hours ${config.opensAt}–${config.closesAt}` : 'Loading office hours'}
            <span>Shared office pool table</span>
          </div>
        </section>
        <section className="tv-panel tv-standings">
          <div className="tv-section-title">
            <h2>
              <Trophy size={22} />
              League standings
            </h2>
            <span>{data?.season?.name ?? 'No published season'}</span>
          </div>
          <table>
            <caption className="sr-only">League standings</caption>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Player</th>
                <th>P</th>
                <th>W</th>
                <th>L</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {data?.standings.map((r) => (
                <tr key={r.id} className={r.qualifying ? 'tv-qualified' : ''}>
                  <td>{r.position}</td>
                  <td className={r.name.length > 28 ? 'tv-long-name' : undefined}>{r.name}</td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.lost}</td>
                  <td>
                    {r.difference > 0 ? '+' : ''}
                    {r.difference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.standings.length && (
            <p className="muted">Standings will appear when a season is published.</p>
          )}
          <p className="tv-legend">
            <span className="qualification-dot" />
            {data?.season?.locked
              ? 'Confirmed playoff qualifiers'
              : 'Top four · Provisional qualification'}
          </p>
        </section>
        <section className="tv-panel tv-queue">
          <div className="tv-section-title">
            <h2>
              <Clock3 size={22} />
              Next on the table
            </h2>
            <span>Today{pageCount > 1 ? ` · ${queuePage + 1}/${pageCount}` : ''}</span>
          </div>
          {upcoming.slice(queuePage * queueSize, queuePage * queueSize + queueSize).map((b) => (
            <div className="tv-booking-row" key={b.id}>
              <strong>{londonTime(b.startAt)}</strong>
              <div>
                <h3>{b.owner}</h3>
                <p>
                  {b.kind === 'league' ? 'League match' : 'Casual game'} · {b.duration} min
                </p>
                {!!b.participants.length && <small>{b.participants.join(' · ')}</small>}
              </div>
            </div>
          ))}
          {!upcoming.length && (
            <p className="tv-empty">
              No more bookings today.
              <br />
              Scan the code to book the table.
            </p>
          )}
        </section>
        <section className="tv-panel tv-results">
          <div className="tv-result-column">
            <div className="tv-section-title">
              <h2>Recent results</h2>
              <span>Approved results</span>
            </div>
            {data?.results.map((r) => (
              <div className="tv-result" key={r.id}>
                <span>{r.home}</span>
                <strong>
                  {r.homeScore}
                  <i>:</i>
                  {r.awayScore}
                </strong>
                <span>{r.away}</span>
              </div>
            ))}
            {!data?.results.length && <p className="tv-empty">No confirmed results yet.</p>}
          </div>
          <div className="tv-result-column">
            <h2 className="tv-fixtures-title">Upcoming fixtures</h2>
            {data?.fixtures.map((f) => (
              <div className="tv-fixture" key={f.id}>
                <strong>
                  {f.home} <span>v</span> {f.away}
                </strong>
                <small>
                  {f.bookedAt
                    ? `Table booked · ${bookingDayLabel(londonDate(f.bookedAt))} ${londonTime(f.bookedAt)}`
                    : `Due ${bookingDayLabel(f.dueDate)} · Table not reserved`}
                </small>
              </div>
            ))}
            {!data?.fixtures.length && <p className="tv-empty">No upcoming league fixtures.</p>}
          </div>
        </section>
        <aside className="tv-qr">
          <QRCodeSVG
            value={bookingUrl}
            size={172}
            marginSize={4}
            level="M"
            title="Scan to book the pool table"
          />
          <div>
            <h2>Book the table</h2>
            <p>Scan to reserve the table</p>
            <span>League and casual bookings.</span>
          </div>
        </aside>
      </div>
      <footer className="tv-footer">
        <span>
          {stale
            ? error || 'Data may be out of date · Automatically refreshing'
            : data
              ? `Updated ${londonTime(data.fetchedAt)} · Refreshes every 30 seconds`
              : 'Connecting…'}
        </span>
        <span>{liveMode ? 'Virtuoso · Shared office table' : 'Demo · Browser-local data'}</span>
        <span>Fixtures, results and bookings.</span>
      </footer>
    </main>
  );
}
