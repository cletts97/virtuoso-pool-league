import { createHash } from 'node:crypto';
import type { LeagueState } from '../../src/domain/types';
import { londonDate, londonTime, bookingDayLabel } from '../../src/domain/bookings';
import { addDays, participantName, weekStart, weekLabel } from '../../src/domain/rules';
import { pendingHours } from '../../src/data/automaticResults';
import { reviewEmailIntents } from './resultEmails';

export interface ScheduledEmailIntent {
  eventId: string;
  sourceEventId?: string;
  recipientId: string;
  purpose: 'reminder' | 'newsletter';
  kind: 'league' | 'casual' | null;
  matchId: string | null;
  subject: string;
  body: string;
  html?: string;
}
export function mondayNewsletterWindow(now: Date) {
  return (
    new Date(`${londonDate(now)}T12:00:00Z`).getUTCDay() === 1 && londonTime(now).startsWith('07:')
  );
}
export function mondayOfWeek(now: Date) {
  const date = londonDate(now);
  return weekStart(date);
}
function stableEventId(value: string) {
  const hex = createHash('sha256').update(value).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '5' + hex.slice(13, 16),
    'a' + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function reminderEmailIntents(
  state: LeagueState,
  now: Date,
  appUrl: string,
): ScheduledEmailIntent[] {
  const candidates = reviewEmailIntents(
    { ...state, fixtures: [], casualResults: [] },
    state,
    appUrl,
  );
  return candidates
    .filter((i) => {
      const record =
        i.kind === 'league'
          ? state.fixtures.find((f) => f.id === i.matchId)
          : state.casualResults?.find((r) => r.id === i.matchId);
      if (!record || pendingHours(record, now) < 24 || pendingHours(record, now) >= 48)
        return false;
      if (i.kind === 'league') {
        const fixture = state.fixtures.find((f) => f.id === i.matchId)!;
        const season = state.seasons.find((s) => s.id === fixture.seasonId);
        return (
          !!season &&
          ['regular', 'playoffs'].includes(season.status) &&
          !(season.status === 'playoffs' && fixture.stage === 'regular')
        );
      }
      return true;
    })
    .map((i) => ({
      ...i,
      purpose: 'reminder',
      sourceEventId: i.eventId,
      eventId: stableEventId('vpl-reminder/' + i.eventId),
      subject: 'Reminder: please review your pool result',
      body: `${i.body}\n\nThis result has been awaiting review for over 24 hours. It will be automatically confirmed 48 hours after the latest submission unless an opponent disputes it first.`,
    }));
}

export function newsletterEmailIntents(
  state: LeagueState,
  now: Date,
  appUrl: string,
): ScheduledEmailIntent[] {
  if (!mondayNewsletterWindow(now)) return [];
  const monday = mondayOfWeek(now),
    sunday = addDays(monday, 6);
  const seasons = state.seasons.filter((s) => ['regular', 'playoffs'].includes(s.status));
  const fixtures = state.fixtures
    .filter(
      (f) =>
        seasons.some((s) => s.id === f.seasonId) &&
        ['scheduled', 'postponed'].includes(f.status) &&
        weekStart(f.dueDate) === monday,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  if (!fixtures.length) return [];
  const lastMonday = addDays(monday, -7);
  const lastResults = state.fixtures
    .filter((f) => {
      if (
        f.status !== 'confirmed' ||
        !f.score ||
        !state.seasons.some((s) => s.id === f.seasonId && s.status !== 'draft')
      )
        return false;
      const event = [...f.history]
        .reverse()
        .find((h) => ['approved', 'auto_approved', 'corrected'].includes(h.action));
      if (!event || !Number.isFinite(Date.parse(event.at))) return false;
      const date = londonDate(event.at);
      return date >= lastMonday && date < monday;
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 100)
    .map(
      (f) =>
        participantName(state, f.homeId) +
        ' ' +
        f.score!.home +
        '–' +
        f.score!.away +
        ' ' +
        participantName(state, f.awayId),
    );
  const resultText = lastResults.length
    ? '\n\nLast week’s confirmed league results:\n' + lastResults.join('\n')
    : '';
  const resultHtml = lastResults.length
    ? '<h2 style="font-size:20px;margin-top:28px">Last week’s league results</h2><p style="color:#a9b5c7;font-size:13px">Confirmed during the previous Monday–Sunday.</p><table role="presentation" style="width:100%;border-collapse:collapse">' +
      lastResults
        .map(
          (line) =>
            '<tr><td style="padding:12px;border-bottom:1px solid #26303f">' +
            escape(line) +
            '</td></tr>',
        )
        .join('') +
      '</table>'
    : '';
  const eventId = stableEventId('vpl-weekly/' + monday);
  const url = new URL('/fixtures', appUrl).href;
  const logo = new URL('/brand/virtuoso-white.png', appUrl).href;
  return state.players
    .filter((p) => p.active)
    .map((player) => {
      const lines = fixtures.slice(0, 100).map((f) => {
        const own = state.participants.some(
          (p) => [f.homeId, f.awayId].includes(p.id) && p.playerIds.includes(player.id),
        );
        const stage =
          f.stage === 'final' ? 'Final' : f.stage === 'semifinal' ? 'Semifinal' : 'League';
        return {
          own,
          text: `${own ? 'Your fixture · ' : ''}${participantName(state, f.homeId)} v ${participantName(state, f.awayId)} — ${stage}${f.status === 'postponed' ? ' · Postponed' : ''} · ${weekLabel(f.dueDate)}`,
        };
      });
      const subject = `Virtuoso Pool League · Fixtures for week of ${bookingDayLabel(monday)}`;
      const body = `Hi ${player.name},\n\nHere are this week's fixtures. Arrange a time with your opponent during the assigned week, or play early. No playing date or time is assigned; table bookings are separate.\n\n${lines.map((l) => l.text).join('\n')}${resultText}\n\nView all fixtures and book the table:\n${url}\n\nVirtuoso Pool League`;
      const html = `<!doctype html><html lang="en"><body style="margin:0;background:#0c121c;color:#edf0f5;font-family:Arial,Helvetica,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 24px"><img src="${escape(logo)}" alt="Virtuoso" width="180" style="display:block;max-width:100%"><p style="color:#ff7938;font-size:12px;letter-spacing:2px">POOL LEAGUE · WEEKLY FIXTURES</p><h1 style="font-size:26px">This week in the league</h1><p>Hi ${escape(player.name)},</p><p style="color:#a9b5c7">Arrange a time with your opponent during the assigned week, or play early. No playing date or time is assigned. Table bookings are separate.</p><table role="presentation" style="width:100%;border-collapse:collapse">${lines.map((l) => `<tr><td style="padding:14px 12px;border-bottom:1px solid #26303f;${l.own ? 'border-left:3px solid #ff7938;' : ''}">${escape(l.text)}</td></tr>`).join('')}</table>${resultHtml}<p style="margin-top:28px"><a href="${escape(url)}" style="display:inline-block;padding:12px 18px;background:#ff7938;color:#0c121c;text-decoration:none;border-radius:6px;font-weight:bold">View fixtures</a></p><p style="color:#a9b5c7;font-size:12px">Virtuoso Pool League · ${escape(bookingDayLabel(monday))}–${escape(bookingDayLabel(sunday))}</p></div></body></html>`;
      return {
        eventId,
        recipientId: player.id,
        purpose: 'newsletter',
        kind: null,
        matchId: null,
        subject,
        body,
        html,
      };
    });
}
