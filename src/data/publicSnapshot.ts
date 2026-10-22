import type { LeagueState, Player } from '../domain/types';
import { addDays, playedDate } from '../domain/rules';
import { londonDate } from '../domain/bookings';
import { recentResults } from '../domain/recentResults';

export const PUBLIC_VISITOR_ID = 'public-visitor';

/** Explicit allowlist: adding private fields to domain models must not publish them. */
export function publicSnapshot(source: LeagueState, now = new Date()): LeagueState {
  const seasons = source.seasons
    .filter((s) => s.status !== 'draft')
    .map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      format: s.format,
      status: s.status,
      participantIds: [...s.participantIds],
      qualifiers: [...s.qualifiers],
      config: { roundsPerWeek: s.config.roundsPerWeek },
      championId: s.championId,
    }));
  const seasonIds = new Set(seasons.map((s) => s.id));
  const participantIds = new Set(seasons.flatMap((s) => s.participantIds));
  const participants = source.participants
    .filter((p) => participantIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      playerIds: [...p.playerIds],
    }));
  const fixtures = source.fixtures
    .filter((f) => seasonIds.has(f.seasonId))
    .map((f) => ({
      id: f.id,
      seasonId: f.seasonId,
      round: f.round,
      homeId: f.homeId,
      awayId: f.awayId,
      dueDate: f.dueDate,
      stage: f.stage,
      bestOf: f.bestOf,
      status: f.status,
      bracketSlot: f.bracketSlot,
      score: f.status === 'confirmed' && f.score ? { ...f.score } : undefined,
      // Preserve the played date for result ordering, without publishing audit identities/notes.
      history:
        f.status === 'confirmed'
          ? [{ id: `${f.id}-played`, action: 'submitted' as const, actorId: '', at: playedDate(f) }]
          : [],
    }));
  const today = londonDate(now);
  const bookings = source.bookings
    .filter(
      (b) =>
        b.status === 'reserved' &&
        londonDate(b.startAt) >= today &&
        londonDate(b.startAt) <= addDays(today, 7),
    )
    .map((b) => ({
      id: b.id,
      ownerId: b.ownerId,
      kind: b.kind,
      startAt: b.startAt,
      duration: b.duration,
      fixtureId: fixtures.some((f) => f.id === b.fixtureId) ? b.fixtureId : undefined,
      guestIds: [...b.guestIds],
      status: b.status,
      createdAt: b.startAt,
      updatedAt: b.startAt,
    }));
  const casualResults = (source.casualResults ?? [])
    .filter((r) => r.status === 'confirmed')
    .map((r) => ({
      id: r.id,
      homePlayerIds: [...r.homePlayerIds],
      awayPlayerIds: [...r.awayPlayerIds],
      playedOn: r.playedOn,
      bestOf: r.bestOf,
      score: { ...r.score },
      status: r.status,
      history: [],
    }));
  const visiblePlayers = new Set([
    ...recentResults(source, 6)
      .filter((r) => r.kind === 'casual')
      .flatMap((r) => [r.homeAvatarId, r.awayAvatarId]),
    ...casualResults.flatMap((r) => [...r.homePlayerIds, ...r.awayPlayerIds]),
    ...participants.flatMap((p) => p.playerIds),
    ...bookings.flatMap((b) => [b.ownerId, ...b.guestIds]),
  ]);
  const players: Player[] = source.players
    .filter((p) => visiblePlayers.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      department: '',
      role: 'player',
      active: true,
    }));
  // A non-account visitor keeps existing presentation components compatible; no Auth identity.
  players.push({
    id: PUBLIC_VISITOR_ID,
    name: 'Guest',
    color: 0,
    department: '',
    role: 'colleague',
    active: false,
  });
  return {
    version: 3,
    casualResults,
    casualResultsEnabled: source.casualResultsEnabled,
    readOnly: true,
    recentResults: recentResults(source, 6),
    currentUserId: PUBLIC_VISITOR_ID,
    selectedSeasonId: seasons[0]?.id ?? '',
    theme: 'dark',
    players,
    participants,
    seasons,
    fixtures,
    bookings,
    bookingConfig: {
      timeZone: source.bookingConfig.timeZone,
      opensAt: source.bookingConfig.opensAt,
      closesAt: source.bookingConfig.closesAt,
      weekdays: [...source.bookingConfig.weekdays],
    },
    availability: [],
    notifications: [],
    announcements: source.announcements
      .filter((a) => seasonIds.has(a.seasonId))
      .map((a) => ({
        id: a.id,
        seasonId: a.seasonId,
        title: a.title,
        body: a.body,
        createdAt: a.createdAt,
      })),
  };
}
