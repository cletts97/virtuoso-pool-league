import type { LeagueState } from './types';
import { participantName, playedDate } from './rules';

export interface RecentResult {
  id: string;
  kind: 'league' | 'casual';
  format: 'singles' | 'doubles';
  status: 'pending' | 'confirmed' | 'disputed' | 'cancelled';
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeAvatarId: string;
  awayAvatarId: string;
  updatedAt: string;
}
export const resultLabel = (r: Pick<RecentResult, 'kind' | 'format'>) =>
  `${r.kind === 'league' ? 'League' : 'Casual'} ${r.format}`;
export const resultStatus = (r: Pick<RecentResult, 'status' | 'kind'>) =>
  r.status === 'pending'
    ? 'Pending confirmation'
    : r.status === 'confirmed'
      ? 'Confirmed'
      : r.status === 'disputed'
        ? 'Disputed'
        : r.kind === 'casual'
          ? 'Voided'
          : 'Cancelled';

/** Explicit public result feed: no audit actors, reasons, email or private photo URLs. */
export function recentResults(state: LeagueState, limit = 3): RecentResult[] {
  if (state.recentResults) return state.recentResults.slice(0, limit);
  if (state.readOnly) return [];
  const rows: RecentResult[] = [];
  for (const f of state.fixtures) {
    const season = state.seasons.find((s) => s.id === f.seasonId);
    if (
      !season ||
      season.status === 'draft' ||
      !f.score ||
      !['pending', 'confirmed', 'disputed', 'cancelled'].includes(f.status)
    )
      continue;
    rows.push({
      id: f.id,
      kind: 'league',
      format: season.format,
      status: f.status as RecentResult['status'],
      home: participantName(state, f.homeId),
      away: participantName(state, f.awayId),
      homeScore: f.score.home,
      awayScore: f.score.away,
      homeAvatarId: f.homeId,
      awayAvatarId: f.awayId,
      updatedAt: f.history.at(-1)?.at ?? playedDate(f),
    });
  }
  for (const r of state.casualResults ?? []) {
    const name = (ids: string[]) =>
      ids.map((id) => state.players.find((p) => p.id === id)?.name ?? 'Former account').join(' & ');
    rows.push({
      id: r.id,
      kind: 'casual',
      format: r.homePlayerIds.length === 2 ? 'doubles' : 'singles',
      status: r.status,
      home: name(r.homePlayerIds),
      away: name(r.awayPlayerIds),
      homeScore: r.score.home,
      awayScore: r.score.away,
      homeAvatarId: r.homePlayerIds[0],
      awayAvatarId: r.awayPlayerIds[0],
      updatedAt: r.history.at(-1)?.at ?? `${r.playedOn}T00:00:00Z`,
    });
  }
  return rows
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
