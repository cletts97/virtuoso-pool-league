import type { Fixture, LeagueState, Participant } from './types';
import { addDays, dateOnly, invariant, weekStart } from './rules';
import { canAddSeasonPlayer } from './seasonManagement';
import { scheduleKey, twoMatchFactors } from './twoMatchWeeks';

export function planRebalancedEnrollment(
  state: LeagueState,
  seasonId: string,
  requestIds: string[],
  now = new Date(),
) {
  const season = state.seasons.find((s) => s.id === seasonId);
  invariant(
    season?.status === 'regular' && canAddSeasonPlayer(state, season),
    'This season cannot accept a revised schedule.',
  );
  invariant(
    requestIds.length > 0 && new Set(requestIds).size === requestIds.length,
    'Choose one or more different join requests.',
  );
  const requests = [...requestIds].sort().map((id) => state.joinRequests?.find((r) => r.id === id));
  invariant(
    requests.every((r) => r?.seasonId === season.id && r.status === 'pending'),
    'A selected request is no longer pending for this season.',
  );
  const playerIds = requests.map((r) => r!.playerId).sort();
  invariant(new Set(playerIds).size === playerIds.length, 'A player is selected more than once.');
  invariant(
    season.participantIds.length + playerIds.length <= 40,
    'A season supports up to 40 players.',
  );
  const entries: Participant[] = playerIds.map((playerId) => {
    const player = state.players.find((p) => p.id === playerId);
    invariant(player?.active, 'A selected account is inactive.');
    invariant(
      !state.participants.some(
        (p) => season.participantIds.includes(p.id) && p.playerIds.includes(playerId),
      ),
      'A selected player is already in this season.',
    );
    return (
      state.participants.find(
        (p) => p.kind === 'individual' && p.playerIds.length === 1 && p.playerIds[0] === playerId,
      ) ?? {
        id: `entrant:${playerId}`,
        name: player.name,
        kind: 'individual',
        playerIds: [playerId],
      }
    );
  });
  const existing = season.participantIds.map((id) => state.participants.find((p) => p.id === id));
  invariant(
    existing.every((p) => p?.kind === 'individual' && p.playerIds.length === 1),
    'Rebalancing supports singles seasons only.',
  );
  const currentWeek = weekStart(dateOnly(now));
  const firstFuture = [addDays(currentWeek, 7), weekStart(season.startDate)].sort().at(-1)!;
  const regular = state.fixtures.filter((f) => f.seasonId === season.id && f.stage === 'regular');
  const booked = new Set(
    state.bookings.filter((b) => b.status === 'reserved').map((b) => b.fixtureId),
  );
  const protectedFixture = (f: Fixture) =>
    weekStart(f.dueDate) <= currentWeek ||
    !!f.score ||
    !!f.submittedBy ||
    booked.has(f.id) ||
    !['scheduled', 'postponed'].includes(f.status) ||
    f.history.some((h) =>
      ['submitted', 'approved', 'auto_approved', 'disputed', 'corrected'].includes(h.action),
    );
  const fixed = regular.filter(protectedFixture);
  const movable = regular.filter((f) => !protectedFixture(f));
  const allEntries = [...(existing as Participant[]), ...entries];
  const entrantIds = new Set(entries.map((p) => p.id));
  const firstRound = Math.max(0, ...regular.map((f) => f.round)) + 1;
  const added: Fixture[] = [];
  for (let a = 0; a < allEntries.length; a++)
    for (let b = a + 1; b < allEntries.length; b++) {
      const home = allEntries[a],
        away = allEntries[b];
      if (!entrantIds.has(home.id) && !entrantIds.has(away.id)) continue;
      invariant(
        !regular.some(
          (f) => [f.homeId, f.awayId].includes(home.id) && [f.homeId, f.awayId].includes(away.id),
        ),
        'A new pairing already exists.',
      );
      added.push({
        id: `addition:${home.id}/${away.id}`,
        seasonId,
        round: firstRound + added.length,
        homeId: home.id,
        awayId: away.id,
        dueDate: firstFuture,
        stage: 'regular',
        bestOf: 3,
        status: 'scheduled',
        history: [],
      });
    }
  const load = new Map<string, number>();
  const key = (week: string, id: string) => `${week}/${id}`;
  const count = (week: string, id: string) => load.get(key(week, id)) ?? 0;
  const increase = (week: string, id: string) => load.set(key(week, id), count(week, id) + 1);
  fixed
    .filter((f) => f.status !== 'cancelled')
    .forEach((f) => {
      increase(weekStart(f.dueDate), f.homeId);
      increase(weekStart(f.dueDate), f.awayId);
    });
  const remaining = [...movable, ...added];
  const dates = new Map<string, string>();
  const place = (f: Fixture, week: string) => {
    dates.set(f.id, week);
    increase(week, f.homeId);
    increase(week, f.awayId);
    remaining.splice(remaining.indexOf(f), 1);
  };
  const fits = (f: Fixture, week: string) => count(week, f.homeId) < 2 && count(week, f.awayId) < 2;
  // Existing current-week fixtures are immutable. Fill only genuinely spare places
  // with new pairings, prioritizing a match between the joiners themselves.
  if (weekStart(season.startDate) <= currentWeek) {
    for (const f of [...added].sort(
      (a, b) =>
        Number(entrantIds.has(b.homeId) && entrantIds.has(b.awayId)) -
          Number(entrantIds.has(a.homeId) && entrantIds.has(a.awayId)) || a.id.localeCompare(b.id),
    )) {
      if (fits(f, currentWeek)) place(f, currentWeek);
    }
  }
  let week = firstFuture;
  while (remaining.length) {
    let best: Fixture[] = [];
    let bestScore = -Infinity;
    // A few deterministic orientations give alternatives around protected
    // bookings/results. Full-capacity newcomers remain active in ordinary weeks.
    for (let salt = 0; salt < 4; salt++)
      for (const factor of twoMatchFactors(
        remaining,
        allEntries.map((p) => p.id),
        salt,
      )) {
        const candidate: Fixture[] = [];
        const local = new Map<string, number>();
        const ordered = [...factor].sort(
          (a, b) =>
            Number(entrantIds.has(b.homeId) || entrantIds.has(b.awayId)) -
              Number(entrantIds.has(a.homeId) || entrantIds.has(a.awayId)) ||
            a.id.localeCompare(b.id),
        );
        for (const f of ordered) {
          if ([f.homeId, f.awayId].every((id) => count(week, id) + (local.get(id) ?? 0) < 2)) {
            candidate.push(f);
            for (const id of [f.homeId, f.awayId]) local.set(id, (local.get(id) ?? 0) + 1);
          }
        }
        const newGames = candidate.reduce(
          (n, f) => n + Number(entrantIds.has(f.homeId)) + Number(entrantIds.has(f.awayId)),
          0,
        );
        const aligned = candidate.filter(
          (f) => !added.includes(f) && weekStart(f.dueDate) === week,
        ).length;
        const score = newGames * 10000 + candidate.length * 100 + aligned;
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    best.forEach((f) => place(f, week));
    // Fill residual spare places left by a protected fixture or a dummy bye.
    for (const f of [...remaining].sort((a, b) => a.id.localeCompare(b.id)))
      if (fits(f, week)) place(f, week);
    week = addDays(week, 7);
  }
  const additions = added.map((f) => ({ ...f, dueDate: dates.get(f.id)! }));
  const moved = movable
    .filter((f) => weekStart(f.dueDate) !== dates.get(f.id))
    .map((f) => ({ id: f.id, from: f.dueDate, to: dates.get(f.id)! }));
  const fixtures = regular
    .map((f) => (dates.has(f.id) ? { ...f, dueDate: dates.get(f.id)! } : f))
    .concat(additions);
  const weeks = [
    ...new Set(fixtures.filter((f) => f.status !== 'cancelled').map((f) => weekStart(f.dueDate))),
  ]
    .filter((w) => w >= currentWeek)
    .sort();
  const lastWeek = fixtures.reduce(
    (latest, f) => (weekStart(f.dueDate) > latest ? weekStart(f.dueDate) : latest),
    weekStart(season.startDate),
  );
  const oldLastWeek = regular.reduce(
    (latest, f) => (weekStart(f.dueDate) > latest ? weekStart(f.dueDate) : latest),
    weekStart(season.startDate),
  );
  const previewKey = scheduleKey(
    JSON.stringify({ season, requests, week: currentWeek, fixed, moved, additions }),
  );
  return {
    previewKey,
    entries,
    additions,
    moved,
    fixtures,
    currentWeek,
    weeks,
    lastWeek,
    oldLastWeek,
    playoffWeek: addDays(lastWeek, 7),
    protectedCount: fixed.length,
  };
}
