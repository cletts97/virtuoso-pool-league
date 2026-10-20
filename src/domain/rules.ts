import type { Fixture, LeagueState, Participant, Player, Score, Season, Standing } from './types';

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function dateOnly(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validateDate(value: string) {
  invariant(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'Enter a valid date.',
  );
}
export function validScore(score: Score, bestOf: number): boolean {
  const target = Math.floor(bestOf / 2) + 1;
  return (
    [3, 5, 7].includes(bestOf) &&
    Number.isInteger(score.home) &&
    Number.isInteger(score.away) &&
    score.home >= 0 &&
    score.away >= 0 &&
    ((score.home === target && score.away < target) ||
      (score.away === target && score.home < target))
  );
}
export function scoreOptions(bestOf: number): Score[] {
  const target = Math.floor(bestOf / 2) + 1;
  return Array.from({ length: target }, (_, loser) => [
    { home: target, away: loser },
    { home: loser, away: target },
  ]).flat();
}
export function generateRoundRobin(season: Season): Fixture[] {
  validateDate(season.startDate);
  invariant(season.participantIds.length >= 2, 'Select at least two participants.');
  invariant(
    new Set(season.participantIds).size === season.participantIds.length,
    'Participants must be unique.',
  );
  invariant(
    season.config.roundsPerWeek >= 1 && season.config.roundsPerWeek <= 7,
    'Use between one and seven rounds per week.',
  );
  const rotation: (string | null)[] = [...season.participantIds];
  if (rotation.length % 2) rotation.push(null);
  const fixtures: Fixture[] = [];
  for (let round = 1; round < rotation.length; round++) {
    const dueDate = addDays(
      season.startDate,
      Math.ceil((round * 7) / season.config.roundsPerWeek) - 1,
    );
    for (let i = 0; i < rotation.length / 2; i++) {
      const a = rotation[i],
        b = rotation[rotation.length - 1 - i];
      if (!a || !b) continue;
      const [homeId, awayId] = (round + i) % 2 ? [a, b] : [b, a];
      fixtures.push({
        id: `${season.id}-r${round}-${i}`,
        seasonId: season.id,
        round,
        homeId,
        awayId,
        dueDate,
        stage: 'regular',
        bestOf: 3,
        status: 'scheduled',
        history: [],
      });
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return fixtures;
}
export function standings(season: Season, fixtures: Fixture[]): Standing[] {
  const rows = new Map(
    season.participantIds.map((id) => [
      id,
      {
        participantId: id,
        played: 0,
        won: 0,
        lost: 0,
        framesWon: 0,
        framesLost: 0,
        difference: 0,
        winPercentage: 0,
        position: 0,
        form: [] as boolean[],
      },
    ]),
  );
  const seen = new Set<string>();
  const approved: Fixture[] = [];
  for (const fixture of [...fixtures].sort(
    (a, b) =>
      playedDate(a).localeCompare(playedDate(b)) || a.round - b.round || a.id.localeCompare(b.id),
  )) {
    if (
      fixture.seasonId !== season.id ||
      fixture.stage !== 'regular' ||
      fixture.status !== 'confirmed' ||
      !fixture.score ||
      !rows.has(fixture.homeId) ||
      !rows.has(fixture.awayId) ||
      !validScore(fixture.score, fixture.bestOf) ||
      seen.has(fixture.id)
    )
      continue;
    seen.add(fixture.id);
    approved.push(fixture);
    for (const [id, own, other] of [
      [fixture.homeId, fixture.score.home, fixture.score.away],
      [fixture.awayId, fixture.score.away, fixture.score.home],
    ] as const) {
      const row = rows.get(id);
      if (!row) continue;
      row.played++;
      row.framesWon += own;
      row.framesLost += other;
      const won = own > other;
      row.won += Number(won);
      row.lost += Number(!won);
      row.form.push(won);
      row.difference = row.framesWon - row.framesLost;
      row.winPercentage = Math.round((row.won / row.played) * 100);
    }
  }
  const ranked = [...rows.values()].sort(
    (a, b) =>
      b.won - a.won ||
      b.difference - a.difference ||
      b.framesWon - a.framesWon ||
      (a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0),
  );
  const result: Standing[] = [];
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    const first = ranked[start];
    while (
      end < ranked.length &&
      ranked[end].won === first.won &&
      ranked[end].difference === first.difference &&
      ranked[end].framesWon === first.framesWon
    )
      end++;
    const group: Standing[] = ranked.slice(start, end);
    // Resolve whole tied groups, never pairwise comparisons that can form a cyclic sort.
    const meeting =
      group.length === 2
        ? approved.find(
            (f) =>
              [f.homeId, f.awayId].includes(group[0].participantId) &&
              [f.homeId, f.awayId].includes(group[1].participantId),
          )
        : undefined;
    if (meeting) {
      if (winner(meeting) === group[1].participantId) group.reverse();
    } else if (group.length > 1) {
      const ids = group.map((row) => row.participantId);
      group.forEach((row) => {
        row.unresolvedTie = ids;
      });
    }
    result.push(...group);
    start = end;
  }
  return result.map((row, index) => ({ ...row, position: index + 1 }));
}

/** Only an unresolved group spanning the fourth-place cutoff blocks qualification. */
export function qualificationTie(season: Season, fixtures: Fixture[]): string[] {
  const rows = standings(season, fixtures);
  const tied = rows[3]?.unresolvedTie;
  return tied && rows[4] && tied.includes(rows[4].participantId) ? tied : [];
}
/** Use the original submission date, so a later correction does not change match order. */
export function playedDate(fixture: Fixture): string {
  return (
    fixture.history.find((h) => h.action === 'submitted')?.at ?? `${fixture.dueDate}T12:00:00Z`
  );
}
export function isParticipant(
  fixture: Fixture,
  playerId: string,
  participants: Participant[],
): boolean {
  return participants.some(
    (p) => [fixture.homeId, fixture.awayId].includes(p.id) && p.playerIds.includes(playerId),
  );
}
export function canApprove(
  fixture: Fixture,
  playerId: string,
  participants: Participant[],
): boolean {
  if (fixture.status !== 'pending' || !fixture.submittedBy) return false;
  const submitterSide = participants.find(
    (p) =>
      [fixture.homeId, fixture.awayId].includes(p.id) && p.playerIds.includes(fixture.submittedBy!),
  );
  return (
    isParticipant(fixture, playerId, participants) &&
    !!submitterSide &&
    !submitterSide.playerIds.includes(playerId)
  );
}
export function requireAdmin(player: Player) {
  invariant(player.role === 'admin' && player.active, 'Administrator access is required.');
}
export function matchStatus(fixture: Fixture, today = dateOnly()): string {
  return fixture.status === 'scheduled' && fixture.dueDate < today ? 'overdue' : fixture.status;
}
export function winner(fixture: Fixture): string | undefined {
  return fixture.status === 'confirmed' && fixture.score
    ? fixture.score.home > fixture.score.away
      ? fixture.homeId
      : fixture.awayId
    : undefined;
}
export function regularComplete(season: Season, fixtures: Fixture[]): boolean {
  const regular = fixtures.filter((f) => f.seasonId === season.id && f.stage === 'regular');
  const expected = (season.participantIds.length * (season.participantIds.length - 1)) / 2;
  return (
    expected > 0 && regular.length === expected && regular.every((f) => f.status === 'confirmed')
  );
}
export function qualifiedIds(season: Season, fixtures: Fixture[], force = false): string[] {
  invariant(
    season.participantIds.length >= 4,
    'At least four participants are needed for playoffs.',
  );
  invariant(
    force || regularComplete(season, fixtures),
    'Complete the regular season or explicitly finalize it as an administrator.',
  );
  invariant(
    qualificationTie(season, fixtures).length === 0,
    'A tie crosses the playoff cutoff. An administrator-approved decider is required before qualification can be finalized.',
  );
  return standings(season, fixtures)
    .slice(0, 4)
    .map((row) => row.participantId);
}
export function participantName(state: LeagueState, id: string): string {
  return state.participants.find((p) => p.id === id)?.name ?? 'To be decided';
}
