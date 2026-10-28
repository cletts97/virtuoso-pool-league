import { describe, it, expect, vi } from 'vitest';
import { executeCommand } from '../data/commands';
import { createSeed } from '../data/seed';
import { generateRoundRobin, addDays, weekStart } from './rules';
import { planRebalancedEnrollment } from './rebalancedEnrollment';
import { twoMatchFactors } from './twoMatchWeeks';

export function scenario(count = 16, joiners = 2) {
  const state = createSeed('2026-10-26');
  state.players = Array.from({ length: count + joiners }, (_, i) => ({
    ...state.players[0],
    id: `u${i}`,
    name: `Player ${i}`,
    role: i === 0 ? ('admin' as const) : ('player' as const),
  }));
  state.currentUserId = 'u0';
  state.participants = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    playerIds: [`u${i}`],
    kind: 'individual' as const,
  }));
  const season = {
    ...state.seasons[0],
    id: 'season',
    status: 'regular' as const,
    startDate: '2026-10-26',
    participantIds: state.participants.map((p) => p.id),
    qualifiers: [],
    config: { roundsPerWeek: 2 },
  };
  state.seasons = [season];
  state.selectedSeasonId = season.id;
  state.fixtures = generateRoundRobin(season);
  state.bookings = [];
  state.notifications = [];
  state.joinRequests = Array.from({ length: joiners }, (_, i) => ({
    id: `request${i}`,
    seasonId: season.id,
    playerId: `u${count + i}`,
    status: 'pending' as const,
    createdAt: '2026-10-28T08:00:00Z',
  }));
  return { state, season, requests: state.joinRequests.map((r) => r.id) };
}
const now = new Date('2026-10-28T10:00:00Z');
function counts(fixtures: { homeId: string; awayId: string; dueDate: string; status: string }[]) {
  const counts = new Map<string, number>();
  for (const f of fixtures.filter((f) => f.status !== 'cancelled'))
    for (const id of [f.homeId, f.awayId]) {
      const key = `${weekStart(f.dueDate)}/${id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return counts;
}
describe('two-match graph factors', () => {
  it.each([3, 4, 5, 16, 18, 39, 40])(
    'partitions %i-player matches once with two per player in each group',
    (count) => {
      const { state } = scenario(count, 0);
      const factors = twoMatchFactors(
        state.fixtures,
        state.participants.map((p) => p.id),
        0,
      );
      expect(
        factors
          .flat()
          .map((f) => f.id)
          .sort(),
      ).toEqual(state.fixtures.map((f) => f.id).sort());
      for (const group of factors) {
        const degrees = new Map<string, number>();
        for (const f of group)
          for (const id of [f.homeId, f.awayId]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
        expect(Math.max(...degrees.values())).toBeLessThanOrEqual(2);
      }
    },
  );
});

describe('atomic enrollment and rescheduling command', () => {
  it('accepts both requests, preserves fixture IDs and records each moved week with notifications', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const { state, requests } = scenario();
      const original = structuredClone(state);
      const plan = planRebalancedEnrollment(state, 'season', requests);
      const next = executeCommand(state, {
        type: 'acceptJoinRequestsAndRebalance',
        seasonId: 'season',
        requestIds: requests,
        previewKey: plan.previewKey,
      });
      expect(next.fixtures).toHaveLength(153);
      expect(next.seasons[0].participantIds).toHaveLength(18);
      expect(
        next.joinRequests!.every((r) => r.status === 'approved' && r.reviewedBy === 'u0'),
      ).toBe(true);
      for (const old of original.fixtures) {
        const saved = next.fixtures.find((f) => f.id === old.id)!;
        expect([saved.homeId, saved.awayId, saved.round, saved.status]).toEqual([
          old.homeId,
          old.awayId,
          old.round,
          old.status,
        ]);
        if (plan.moved.some((f) => f.id === old.id))
          expect(saved.history.at(-1)).toMatchObject({ action: 'rescheduled', actorId: 'u0' });
        else expect(saved).toEqual(old);
      }
      expect(next.notifications.some((n) => n.title === 'League fixture week updated')).toBe(true);
      expect(
        next.notifications.filter((n) => n.title === 'League join request accepted'),
      ).toHaveLength(2);
      expect(Math.max(...counts(next.fixtures).values())).toBeLessThanOrEqual(2);
      expect(state).toEqual(original);
      expect(() =>
        executeCommand(next, {
          type: 'acceptJoinRequestsAndRebalance',
          seasonId: 'season',
          requestIds: requests,
          previewKey: plan.previewKey,
        }),
      ).toThrow('pending');
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects player access, altered previews, new bookings and submitted scores after preview', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const { state, requests } = scenario();
      const plan = planRebalancedEnrollment(state, 'season', requests);
      const command = {
        type: 'acceptJoinRequestsAndRebalance' as const,
        seasonId: 'season',
        requestIds: requests,
        previewKey: plan.previewKey,
      };
      expect(() => executeCommand({ ...state, currentUserId: 'u1' }, command)).toThrow(
        'Administrator',
      );
      expect(() => executeCommand(state, { ...command, previewKey: '00000000' })).toThrow(
        'preview has changed',
      );
      const target = state.fixtures.find((f) => f.id === plan.moved[0].id)!;
      const booked = structuredClone(state);
      booked.bookings = [{ ...createSeed().bookings[0], fixtureId: target.id, status: 'reserved' }];
      expect(() => executeCommand(booked, command)).toThrow('preview has changed');
      target.score = { home: 1, away: 0 };
      target.status = 'pending';
      expect(() => executeCommand(state, command)).toThrow('preview has changed');
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('future-week enrollment rebalance', () => {
  it('keeps this week, adds both joiners immediately and gives them two in every future week', () => {
    const { state, requests } = scenario();
    const plan = planRebalancedEnrollment(state, 'season', requests, now);
    expect(plan.additions).toHaveLength(33);
    expect(plan.fixtures).toHaveLength(153);
    expect(plan.lastWeek).toBe('2026-12-21');
    expect(plan.playoffWeek).toBe('2026-12-28');
    for (const f of state.fixtures.filter((f) => f.dueDate === '2026-10-26'))
      expect(plan.fixtures.find((x) => x.id === f.id)).toEqual(f);
    const load = counts(plan.fixtures);
    expect(Math.max(...load.values())).toBe(2);
    for (const p of plan.entries) {
      expect(load.get(`2026-10-26/${p.id}`)).toBe(1);
      for (let i = 1; i < 9; i++)
        expect(load.get(`${addDays('2026-10-26', i * 7)}/${p.id}`)).toBe(2);
    }
    expect(planRebalancedEnrollment(state, 'season', [...requests].reverse(), now).previewKey).toBe(
      plan.previewKey,
    );
    expect(new Set(plan.fixtures.map((f) => [f.homeId, f.awayId].sort().join('/'))).size).toBe(153);
  });
  it('preserves future submitted/confirmed/disputed fixtures and reserved bookings exactly', () => {
    const { state, requests } = scenario();
    const future = state.fixtures.filter((f) => f.dueDate > '2026-10-26');
    for (const [i, status] of ['pending', 'confirmed', 'disputed'].entries()) {
      future[i].status = status as 'pending' | 'confirmed' | 'disputed';
      future[i].score = { home: 2, away: 0 };
      future[i].submittedBy = 'u0';
      future[i].history = [
        {
          id: `event${i}`,
          action: 'submitted',
          actorId: 'u0',
          at: now.toISOString(),
          score: { home: 2, away: 0 },
        },
      ];
    }
    const b = createSeed().bookings[0];
    state.bookings = [{ ...b, fixtureId: future[3].id, status: 'reserved' }];
    const original = structuredClone(state);
    const plan = planRebalancedEnrollment(state, 'season', requests, now);
    for (const f of future.slice(0, 4)) expect(plan.fixtures.find((x) => x.id === f.id)).toEqual(f);
    expect(Math.max(...counts(plan.fixtures).values())).toBeLessThanOrEqual(2);
    expect(state).toEqual(original);
  });
  it.each([
    [5, 1],
    [15, 2],
    [18, 1],
    [30, 2],
  ])('handles %i existing players and %i joiners', (count, joiners) => {
    const { state, requests } = scenario(count, joiners);
    const plan = planRebalancedEnrollment(state, 'season', requests, now);
    expect(plan.fixtures).toHaveLength(((count + joiners) * (count + joiners - 1)) / 2);
    expect(Math.max(...counts(plan.fixtures).values())).toBeLessThanOrEqual(2);
    expect(plan.moved.every((f) => f.to > '2026-10-26' && f.from > '2026-10-26')).toBe(true);
  });
  it('rejects stale, inactive, duplicate, cross-season and closed enrollment', () => {
    const { state, requests } = scenario();
    expect(() =>
      planRebalancedEnrollment(state, 'season', [requests[0], requests[0]], now),
    ).toThrow('different');
    state.joinRequests![0].status = 'approved';
    expect(() => planRebalancedEnrollment(state, 'season', requests, now)).toThrow('pending');
    state.joinRequests![0].status = 'pending';
    state.players.at(-1)!.active = false;
    expect(() => planRebalancedEnrollment(state, 'season', requests, now)).toThrow('inactive');
    state.players.at(-1)!.active = true;
    state.seasons[0].status = 'playoffs';
    expect(() => planRebalancedEnrollment(state, 'season', requests, now)).toThrow('cannot');
  });
});
