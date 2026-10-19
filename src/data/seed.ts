import { addDays, dateOnly, generateRoundRobin, standings, winner } from '../domain/rules';
import type { Fixture, LeagueState, Season } from '../domain/types';

export function createSeed(today = dateOnly()): LeagueState {
  const names = [
    'Alex Morgan',
    'Priya Shah',
    'James Wilson',
    'Sophie Chen',
    'Daniel Brooks',
    'Emma Taylor',
    'Oliver Grant',
    'Amara Okafor',
    'Tom Mitchell',
    'Isabelle Reed',
    'Liam Patel',
    'Charlotte Evans',
  ];
  const departments = [
    'Cloud & Infrastructure',
    'Service Delivery',
    'Cyber Security',
    'People & Culture',
    'Technical Services',
    'Customer Success',
  ];
  const players = names.map((name, i) => ({
    id: `p${String(i + 1).padStart(2, '0')}`,
    name,
    department: departments[i % 6],
    role: i === 0 ? ('admin' as const) : ('player' as const),
    active: true,
    color: i % 6,
  }));
  const participants = players.map((p) => ({
    id: `entry-${p.id}`,
    name: p.name,
    playerIds: [p.id],
    kind: 'individual' as const,
  }));
  const current: Season = {
    id: 'autumn-2026',
    name: 'Autumn League 2026',
    startDate: addDays(today, -24),
    participantIds: participants.map((p) => p.id),
    format: 'singles',
    status: 'regular',
    config: { pointsPerWin: 3, roundsPerWeek: 2 },
    qualifiers: [],
  };
  const previous: Season = {
    ...current,
    id: 'summer-2026',
    name: 'Summer League 2026',
    startDate: addDays(today, -110),
    status: 'complete',
    qualifiers: [],
  };
  const fixtures = [...generateRoundRobin(current), ...generateRoundRobin(previous)];
  function result(f: Fixture, index: number) {
    const homeStrength = participants.findIndex((p) => p.id === f.homeId),
      awayStrength = participants.findIndex((p) => p.id === f.awayId);
    const homeWins = homeStrength < awayStrength !== (index % 5 === 0);
    const target = Math.ceil(f.bestOf / 2);
    f.score = homeWins
      ? { home: target, away: index % target }
      : { home: index % target, away: target };
    f.submittedBy = participants.find((p) => p.id === f.homeId)!.playerIds[0];
    f.status = 'confirmed';
    f.history = [
      {
        id: `${f.id}-submitted`,
        actorId: f.submittedBy,
        action: 'submitted',
        score: { ...f.score },
        at: `${f.dueDate}T10:00:00Z`,
      },
      {
        id: `${f.id}-approved`,
        actorId: participants.find((p) => p.id === f.awayId)!.playerIds[0],
        action: 'approved',
        score: { ...f.score },
        at: `${f.dueDate}T12:00:00Z`,
      },
    ];
  }
  fixtures.forEach((f, i) => {
    if (f.seasonId === previous.id || f.round <= 4) result(f, i);
  });
  const currentRemaining = fixtures.filter((f) => f.seasonId === current.id && f.round === 5);
  currentRemaining.slice(0, 3).forEach((f, i) => {
    result(f, i + 3);
    f.status = i === 2 ? 'disputed' : 'pending';
    f.history.pop();
    if (i === 2)
      f.history.push({
        id: 'seed-dispute',
        actorId: participants.find((p) => p.id === f.awayId)!.playerIds[0],
        action: 'disputed',
        at: `${f.dueDate}T13:00:00Z`,
        reason: 'The final frame was recorded the wrong way around.',
      });
  });
  currentRemaining[3].status = 'postponed';
  currentRemaining[3].dueDate = addDays(today, 7);
  currentRemaining[3].note = 'Annual leave — catch up next week.';
  currentRemaining[3].history.push({
    id: 'seed-postponed',
    actorId: players[0].id,
    action: 'postponed',
    at: `${today}T09:00:00Z`,
    reason: currentRemaining[3].note,
  });
  previous.qualifiers = standings(previous, fixtures)
    .slice(0, 4)
    .map((r) => r.participantId);
  const semis: Fixture[] = [
    [0, 3],
    [1, 2],
  ].map(([h, a], i) => ({
    id: `${previous.id}-sf${i}`,
    seasonId: previous.id,
    round: 12,
    homeId: previous.qualifiers[h],
    awayId: previous.qualifiers[a],
    dueDate: addDays(previous.startDate, 44),
    stage: 'semifinal',
    bestOf: 5,
    status: 'scheduled',
    history: [],
  }));
  semis.forEach(result);
  const final: Fixture = {
    id: `${previous.id}-final`,
    seasonId: previous.id,
    round: 13,
    homeId: winner(semis[0])!,
    awayId: winner(semis[1])!,
    dueDate: addDays(previous.startDate, 48),
    stage: 'final',
    bestOf: 7,
    status: 'scheduled',
    history: [],
  };
  result(final, 1);
  previous.championId = winner(final);
  fixtures.push(...semis, final);
  const state: LeagueState = {
    version: 1,
    players,
    participants,
    seasons: [current, previous],
    fixtures,
    availability: [
      {
        id: 'leave-1',
        playerId: participants.find((p) => p.id === currentRemaining[3].homeId)!.playerIds[0],
        from: addDays(today, -2),
        to: addDays(today, 5),
        reason: 'Annual leave',
      },
    ],
    announcements: [
      {
        id: 'welcome',
        seasonId: current.id,
        title: 'The race to the final four is on.',
        body: 'Two rounds a week. Three points for a win. Arrange your matches with your opponent, and remember to confirm the score. Our top four will meet in the playoffs.',
        createdAt: `${today}T09:00:00Z`,
      },
    ],
    notifications: [],
    currentUserId: players[0].id,
    selectedSeasonId: current.id,
    theme: 'dark',
  };
  for (const player of players) {
    const own = fixtures.filter(
      (f) =>
        f.seasonId === current.id &&
        participants.some(
          (p) => [f.homeId, f.awayId].includes(p.id) && p.playerIds.includes(player.id),
        ),
    );
    const pending = own.find((f) => f.status === 'pending' && f.submittedBy !== player.id);
    const next = own.find((f) => f.status === 'scheduled');
    const recent = own.filter((f) => f.status === 'confirmed').at(-1);
    const postponed = own.find((f) => f.status === 'postponed');
    const disputedMatch = own.find((f) => f.status === 'disputed');
    if (recent)
      state.notifications.push({
        id: `confirmed-${player.id}`,
        userId: player.id,
        seasonId: current.id,
        kind: 'approved',
        title: 'Your result is confirmed',
        body: `Round ${recent.round} is official. The standings have been updated.`,
        fixtureId: recent.id,
        createdAt: `${recent.dueDate}T12:00:00Z`,
        read: true,
      });
    if (postponed)
      state.notifications.push({
        id: `postponed-${player.id}`,
        userId: player.id,
        seasonId: current.id,
        kind: 'postponement',
        title: 'A catch-up match is arranged',
        body: `${postponed.note} Due ${postponed.dueDate}.`,
        fixtureId: postponed.id,
        createdAt: `${today}T09:30:00Z`,
        read: false,
      });
    if (disputedMatch)
      state.notifications.push({
        id: `disputed-${player.id}`,
        userId: player.id,
        seasonId: current.id,
        kind: 'disputed',
        title: 'Your result is under review',
        body: 'An administrator will review the disputed score. It does not count toward standings yet.',
        fixtureId: disputedMatch.id,
        createdAt: `${today}T10:00:00Z`,
        read: false,
      });
    state.notifications.push({
      id: `welcome-${player.id}`,
      userId: player.id,
      seasonId: current.id,
      kind: 'notice',
      title: 'Welcome to the Autumn League',
      body: 'Your fixtures are ready. The table is waiting.',
      createdAt: `${today}T08:00:00Z`,
      read: false,
    });
    if (pending)
      state.notifications.unshift({
        id: `approval-${player.id}`,
        userId: player.id,
        seasonId: current.id,
        kind: 'approval',
        title: 'A result needs your confirmation',
        body: 'Your opponent has submitted a score. Open the match to approve or dispute it.',
        fixtureId: pending.id,
        createdAt: `${today}T09:00:00Z`,
        read: false,
      });
    if (next)
      state.notifications.push({
        id: `upcoming-${player.id}`,
        userId: player.id,
        seasonId: current.id,
        kind: 'upcoming',
        title: 'Your next fixture is ready',
        body: `Round ${next.round} • Arrange a time with your opponent.`,
        fixtureId: next.id,
        createdAt: `${today}T08:30:00Z`,
        read: true,
      });
  }
  const disputed = currentRemaining[2];
  state.notifications.unshift({
    id: 'dispute-admin',
    userId: players[0].id,
    seasonId: current.id,
    kind: 'disputed',
    title: 'A disputed result needs review',
    body: 'Review the submitted score and the player’s explanation.',
    fixtureId: disputed.id,
    createdAt: `${today}T10:00:00Z`,
    read: false,
  });
  return state;
}
