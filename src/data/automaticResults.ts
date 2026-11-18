import type { LeagueState, ResultRevision } from '../domain/types';
import { addDays, validFixtureScore } from '../domain/rules';
import { londonDate, londonToUtc } from '../domain/bookings';
import { validCasualScore } from '../domain/casual';
import { inAppNotifications, progressPlayoffs } from './commands';
import { synchronizeBadges } from './badgeCommands';

export function pendingHours(record: { status: string; history: ResultRevision[] }, now: Date) {
  const event = record.history.at(-1);
  if (record.status !== 'pending' || event?.action !== 'submitted') return -1;
  let cursor = Date.parse(event.at);
  const end = now.getTime();
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor > end) return -1;
  let elapsed = 0;
  // Split at London midnights so BST/GMT changes and partial days are handled
  // correctly. Weekday nights count; Saturday and Sunday contribute no time.
  while (cursor < end) {
    const date = londonDate(new Date(cursor));
    const next = Math.min(end, Date.parse(londonToUtc(addDays(date, 1), '00:00')));
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) elapsed += next - cursor;
    cursor = next;
  }
  return elapsed / 3_600_000;
}

/** Server-scheduled transition only. Never exposed as a user command or attributed to an opponent. */
export function automaticallyConfirmResults(source: LeagueState, now: Date): LeagueState {
  const state = structuredClone(source);
  const audit = (history: ResultRevision[], score: { home: number; away: number }) => {
    history.push({
      id: crypto.randomUUID(),
      action: 'auto_approved',
      actorId: null,
      at: now.toISOString(),
      score: { ...score },
      reason:
        'Automatically confirmed after 48 hours, excluding weekends, without an opposing confirmation or dispute.',
    });
  };
  const changedSeasons = new Set<string>();
  for (const f of state.fixtures) {
    const season = state.seasons.find((s) => s.id === f.seasonId);
    if (
      pendingHours(f, now) < 48 ||
      !f.score ||
      !validFixtureScore(f, f.score) ||
      !season ||
      !['regular', 'playoffs'].includes(season.status) ||
      (season.status === 'playoffs' && f.stage === 'regular')
    )
      continue;
    f.status = 'confirmed';
    audit(f.history, f.score);
    changedSeasons.add(season.id);
    const players = state.participants
      .filter((p) => [f.homeId, f.awayId].includes(p.id))
      .flatMap((p) => p.playerIds);
    inAppNotifications.publish(state, players, {
      seasonId: season.id,
      fixtureId: f.id,
      kind: 'approved',
      title: 'Result automatically confirmed',
      body: 'No confirmation or dispute was received within 48 hours, excluding weekends.',
    });
  }
  for (const r of state.casualResults ?? []) {
    if (pendingHours(r, now) < 48 || !validCasualScore(r.score, r.bestOf)) continue;
    r.status = 'confirmed';
    audit(r.history, r.score);
  }
  for (const season of state.seasons)
    if (changedSeasons.has(season.id)) progressPlayoffs(state, season);
  return synchronizeBadges(state, now);
}
