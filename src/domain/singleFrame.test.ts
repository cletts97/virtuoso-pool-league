import { describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { executeCommand } from '../data/commands';
import { fixtureScoreOptions, standings, validFixtureScore } from './rules';
import { playerLeagueStats, isLeagueDirectoryPlayer } from './playerStats';
import { validCasualScore } from './casual';
import { automaticallyConfirmResults } from '../data/automaticResults';

describe('single-frame league results', () => {
  const regular = { stage: 'regular' as const, bestOf: 3 as const };
  it('allows only completed single frames or completed best-of-three regular results', () => {
    const options = fixtureScoreOptions(regular);
    expect(options).toHaveLength(6);
    expect(options.every((score) => validFixtureScore(regular, score))).toBe(true);
    for (const score of [
      { home: 0, away: 0 },
      { home: 1, away: 1 },
      { home: 2, away: 2 },
      { home: 1.5, away: 0 },
      { home: -1, away: 0 },
    ])
      expect(validFixtureScore(regular, score)).toBe(false);
    for (const f of [
      { stage: 'semifinal' as const, bestOf: 5 as const },
      { stage: 'final' as const, bestOf: 7 as const },
    ]) {
      expect(validFixtureScore(f, { home: 1, away: 0 })).toBe(false);
      expect(fixtureScoreOptions(f).some((s) => s.home === 1 && s.away === 0)).toBe(false);
    }
    expect(validCasualScore({ home: 1, away: 0 }, 3)).toBe(false);
  });
  it('submits, approves and corrects one-frame scores using the existing audit workflow', () => {
    let state = createSeed();
    const f = state.fixtures.find((f) => f.stage === 'regular' && f.status === 'scheduled')!;
    const home = state.participants.find((p) => p.id === f.homeId)!.playerIds[0];
    const away = state.participants.find((p) => p.id === f.awayId)!.playerIds[0];
    const before = playerLeagueStats(state, away);
    const beforeSeasonLosses = standings(
      state.seasons.find((s) => s.id === f.seasonId)!,
      state.fixtures,
    ).find((r) => r.participantId === f.awayId)!.lost;
    state.currentUserId = away;
    state = executeCommand(state, { type: 'submit', fixtureId: f.id, score: { home: 0, away: 1 } });
    expect(playerLeagueStats(state, away)).toEqual(before);
    expect(() =>
      executeCommand(state, { type: 'review', fixtureId: f.id, approve: true, reason: '' }),
    ).toThrow();
    state.currentUserId = home;
    state = executeCommand(state, { type: 'review', fixtureId: f.id, approve: true, reason: '' });
    expect(playerLeagueStats(state, away)).toMatchObject({
      played: before.played + 1,
      won: before.won + 1,
      framesWon: before.framesWon + 1,
      framesLost: before.framesLost,
    });
    state.currentUserId = 'p01';
    state = executeCommand(state, {
      type: 'correct',
      fixtureId: f.id,
      score: { home: 1, away: 0 },
      reason: 'Corrected winner',
    });
    expect(state.fixtures.find((x) => x.id === f.id)!.history.at(-1)!.action).toBe('corrected');
    expect(playerLeagueStats(state, away).won).toBe(before.won);
    expect(
      standings(
        state.seasons.find((s) => s.id === f.seasonId)!,
        state.fixtures,
      ).find((r) => r.participantId === f.awayId)!.lost,
    ).toBe(beforeSeasonLosses + 1);
  });
  it('uses the same 48-hour automatic approval rule for a single-frame result', () => {
    const state = createSeed();
    const f = state.fixtures.find((f) => f.status === 'pending' && f.stage === 'regular')!;
    f.score = { home: 1, away: 0 };
    f.history.at(-1)!.at = '2026-10-24T08:00:00Z';
    const next = automaticallyConfirmResults(state, new Date('2026-10-27T08:00:00Z'));
    expect(next.fixtures.find((x) => x.id === f.id)!.status).toBe('confirmed');
  });
});

describe('league player directory eligibility', () => {
  it('includes current published members without results, and confirmed historical players', () => {
    const state = createSeed();
    const active = state.seasons.find((s) => s.status === 'regular')!;
    state.fixtures = state.fixtures.filter((f) => f.seasonId !== active.id);
    const member = state.participants.find((p) => p.id === active.participantIds[0])!.playerIds[0];
    expect(isLeagueDirectoryPlayer(state, member)).toBe(true);
    active.status = 'complete';
    state.seasons.filter((s) => s.id !== active.id).forEach((s) => (s.status = 'draft'));
    expect(isLeagueDirectoryPlayer(state, member)).toBe(false);
    state.seasons.find((s) => s.id !== active.id)!.status = 'complete';
    expect(isLeagueDirectoryPlayer(state, member)).toBe(true);
  });
  it('excludes casual-only accounts, pending requests and draft-only membership', () => {
    const state = createSeed();
    const id = 'colleague-01';
    expect(isLeagueDirectoryPlayer(state, id)).toBe(false);
    state.participants.push({
      id: 'draft-entry',
      name: 'Draft',
      kind: 'individual',
      playerIds: [id],
    });
    state.seasons.push({
      ...state.seasons[0],
      id: 'draft',
      status: 'draft',
      participantIds: ['draft-entry'],
    });
    expect(isLeagueDirectoryPlayer(state, id)).toBe(false);
  });
});
