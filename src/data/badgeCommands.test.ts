import { describe, expect, it } from 'vitest';
import { createSeed } from './seed';
import { executeCommand } from './commands';
import { synchronizeBadges } from './badgeCommands';
import { automaticallyConfirmResults } from './automaticResults';
import { earnedBadges } from '../domain/badges';
import { publicSnapshot } from './publicSnapshot';
import { displaySnapshot } from './display';
import { privateSnapshot } from '../../api/src/state';
import { commandSchema } from '../../api/src/validation';

function league() {
  const state = createSeed('2026-11-16');
  state.badgesEnabled = true;
  state.badgeAwards = [];
  const season = state.seasons[0];
  state.seasons = [season];
  state.casualResults = [];
  season.status = 'regular';
  season.qualifiers = [];
  delete season.championId;
  const fixture = state.fixtures.find((f) => f.seasonId === season.id && f.stage === 'regular')!;
  fixture.status = 'scheduled';
  fixture.history = [];
  delete fixture.score;
  state.fixtures = [fixture];
  const home = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
  const away = state.participants.find((p) => p.id === fixture.awayId)!.playerIds[0];
  state.currentUserId = home;
  return { state, fixture, home, away, season };
}
function submitted() {
  const data = league();
  const state = executeCommand(data.state, {
    type: 'submit',
    fixtureId: data.fixture.id,
    score: { home: 2, away: 0 },
    badgeClaims: [{ badgeKey: 'break_dish', playerId: data.home }],
  });
  return { ...data, state, award: state.badgeAwards![0] };
}
describe('achievement workflow', () => {
  it('requires an explicit opposing confirmation, separate from score approval', () => {
    const { state, fixture, home, away, award } = submitted();
    expect(earnedBadges(state, home)).toEqual([]);
    expect(() =>
      executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true }),
    ).toThrow('opposing');
    state.currentUserId = away;
    const scoreOnly = executeCommand(state, {
      type: 'review',
      fixtureId: fixture.id,
      approve: true,
      reason: '',
    });
    expect(earnedBadges(scoreOnly, home)).toEqual([]);
    const approved = executeCommand(scoreOnly, {
      type: 'reviewBadge',
      id: award.id,
      approve: true,
    });
    expect(earnedBadges(approved, home)).toHaveLength(1);
    expect(approved.badgeAwards![0].history.map((h) => h.action)).toEqual(['claimed', 'confirmed']);
    expect(() =>
      executeCommand(approved, { type: 'reviewBadge', id: award.id, approve: true }),
    ).toThrow('opposing');
  });
  it('can confirm the achievement before the score, but does not display it until the score is confirmed', () => {
    const { state, fixture, home, away, award } = submitted();
    state.currentUserId = away;
    const approved = executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true });
    expect(earnedBadges(approved)).toEqual([]);
    expect(
      earnedBadges(
        executeCommand(approved, {
          type: 'review',
          fixtureId: fixture.id,
          approve: true,
          reason: '',
        }),
        home,
      ),
    ).toHaveLength(1);
  });
  it('never auto-approves badges, and allows explicit review after a score timeout', () => {
    const { state, award, home, away } = submitted();
    state.fixtures[0].history.at(-1)!.at = '2026-11-16T09:00:00Z';
    const next = automaticallyConfirmResults(state, new Date('2026-11-18T09:00:00Z'));
    expect(next.fixtures[0].status).toBe('confirmed');
    expect(next.badgeAwards![0].status).toBe('pending');
    expect(earnedBadges(next)).toEqual([]);
    next.currentUserId = away;
    expect(
      earnedBadges(
        executeCommand(next, { type: 'reviewBadge', id: award.id, approve: true }),
        home,
      ),
    ).toHaveLength(1);
  });
  it('revokes linked claims after a dispute or correction without deleting their history', () => {
    const { state, fixture, award, away } = submitted();
    state.currentUserId = away;
    const confirmed = executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true });
    const disputed = executeCommand(confirmed, {
      type: 'review',
      fixtureId: fixture.id,
      approve: false,
      reason: 'Wrong score',
    });
    expect(disputed.badgeAwards![0].status).toBe('revoked');
    expect(disputed.badgeAwards![0].history).toHaveLength(3);
    const scored = executeCommand(confirmed, {
      type: 'review',
      fixtureId: fixture.id,
      approve: true,
      reason: '',
    });
    scored.players.find((p) => p.id === away)!.role = 'admin';
    const corrected = executeCommand(scored, {
      type: 'correct',
      fixtureId: fixture.id,
      score: { home: 0, away: 2 },
      reason: 'Corrected winner',
    });
    expect(earnedBadges(corrected)).toEqual([]);
    expect(corrected.badgeAwards![0].status).toBe('revoked');
  });
  it('supports declining without disputing the score', () => {
    const { state, fixture, award, away } = submitted();
    state.currentUserId = away;
    const declined = executeCommand(state, { type: 'reviewBadge', id: award.id, approve: false });
    expect(declined.badgeAwards![0].status).toBe('rejected');
    expect(
      executeCommand(declined, { type: 'review', fixtureId: fixture.id, approve: true, reason: '' })
        .fixtures[0].status,
    ).toBe('confirmed');
  });
  it('blocks inactive, unrelated and same-side reviewers, even when administrators', () => {
    const { state, award, home, away } = submitted();
    const stranger = state.players.find((p) => p.id !== home && p.id !== away)!;
    stranger.role = 'admin';
    state.currentUserId = stranger.id;
    expect(() =>
      executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true }),
    ).toThrow('opposing');
    state.currentUserId = away;
    state.players.find((p) => p.id === away)!.active = false;
    expect(() =>
      executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true }),
    ).toThrow('active');
  });
  it('validates claim recipients, duplicate claims and frames actually won', () => {
    const { state, fixture, home, away } = league();
    const claim = { badgeKey: 'seven_ball' as const, playerId: home };
    expect(() =>
      executeCommand(state, {
        type: 'submit',
        fixtureId: fixture.id,
        score: { home: 2, away: 0 },
        badgeClaims: [claim, claim],
      }),
    ).toThrow('already');
    expect(() =>
      executeCommand(state, {
        type: 'submit',
        fixtureId: fixture.id,
        score: { home: 2, away: 0 },
        badgeClaims: [{ ...claim, playerId: away }],
      }),
    ).toThrow('won a frame');
    expect(() =>
      executeCommand(state, {
        type: 'submit',
        fixtureId: fixture.id,
        score: { home: 2, away: 0 },
        badgeClaims: [{ ...claim, playerId: 'unrelated' }],
      }),
    ).toThrow('played');
    expect(state.fixtures[0].status).toBe('scheduled');
  });
  it('supports casual doubles, excluding the earner’s teammate, and invalidates resubmitted claims', () => {
    const { state } = league();
    const [a, b, c, d] = state.players
      .filter((p) => p.active)
      .slice(0, 4)
      .map((p) => p.id);
    state.currentUserId = a;
    const id = crypto.randomUUID();
    const command = {
      type: 'submitCasual' as const,
      result: {
        id,
        homePlayerIds: [a, b],
        awayPlayerIds: [c, d],
        playedOn: '2026-01-01',
        bestOf: 3 as const,
        score: { home: 2, away: 1 },
      },
      badgeClaims: [{ badgeKey: 'reverse_dish' as const, playerId: a }],
    };
    const next = executeCommand(state, command);
    const award = next.badgeAwards![0];
    expect(
      next.notifications.some(
        (n) => n.casualResultId === id && n.title === 'Achievement needs your review',
      ),
    ).toBe(true);
    next.currentUserId = b;
    expect(() =>
      executeCommand(next, { type: 'reviewBadge', id: award.id, approve: true }),
    ).toThrow('opposing');
    next.currentUserId = c;
    const declinedScore = executeCommand(next, {
      type: 'reviewCasual',
      id,
      approve: false,
      reason: 'Score incorrect',
    });
    declinedScore.currentUserId = a;
    const resubmitted = executeCommand(declinedScore, command);
    expect(resubmitted.badgeAwards!.map((x) => x.status)).toEqual(['revoked', 'pending']);
    resubmitted.currentUserId = d;
    const approved = executeCommand(resubmitted, {
      type: 'reviewBadge',
      id: resubmitted.badgeAwards![1].id,
      approve: true,
    });
    const scored = executeCommand(approved, {
      type: 'reviewCasual',
      id,
      approve: true,
      reason: '',
    });
    expect(earnedBadges(scored, a)).toHaveLength(1);
  });
  it('grants and revokes manually with administrator checks and retained audit', () => {
    const { state, home } = league();
    state.players.find((p) => p.id === home)!.role = 'player';
    expect(() =>
      executeCommand(state, { type: 'grantBadge', playerId: home, badgeKey: 'seven_ball' }),
    ).toThrow('Administrator');
    state.players.find((p) => p.id === home)!.role = 'admin';
    const granted = executeCommand(state, {
      type: 'grantBadge',
      playerId: home,
      badgeKey: 'seven_ball',
      reason: 'Witnessed in person',
    });
    expect(earnedBadges(granted, home)).toHaveLength(1);
    const revoked = executeCommand(granted, {
      type: 'revokeBadge',
      id: granted.badgeAwards![0].id,
      reason: 'Granted in error',
    });
    expect(earnedBadges(revoked, home)).toEqual([]);
    expect(revoked.badgeAwards![0].history).toHaveLength(2);
    expect(revoked.badgeAwards![0].history[1].reason).toBe('Granted in error');
    expect(() =>
      executeCommand(state, { type: 'grantBadge', playerId: home, badgeKey: 'season_champion' }),
    ).toThrow('season');
  });
  it('awards named seasons, handles corrected finals and respects explicit administrator revocation', () => {
    const { state, season, fixture, home, away } = league();
    season.status = 'complete';
    season.qualifiers = season.participantIds.slice(0, 4);
    fixture.stage = 'final';
    fixture.bestOf = 7;
    fixture.status = 'confirmed';
    fixture.score = { home: 4, away: 0 };
    season.championId = fixture.homeId;
    synchronizeBadges(state);
    expect(state.badgeAwards).toHaveLength(3);
    expect(
      earnedBadges(state, home).some(
        (a) => a.badgeKey === 'season_champion' && a.seasonId === season.id,
      ),
    ).toBe(true);
    synchronizeBadges(state);
    expect(state.badgeAwards).toHaveLength(3);
    state.players.find((p) => p.id === home)!.role = 'admin';
    const corrected = executeCommand(state, {
      type: 'correct',
      fixtureId: fixture.id,
      score: { home: 0, away: 4 },
      reason: 'Winner reversed',
    });
    expect(earnedBadges(corrected, away).some((a) => a.badgeKey === 'season_champion')).toBe(true);
    expect(earnedBadges(corrected, home).some((a) => a.badgeKey === 'season_champion')).toBe(false);
    const award = corrected.badgeAwards!.find(
      (a) => a.playerId === away && a.badgeKey === 'season_champion',
    )!;
    const revoked = executeCommand(corrected, {
      type: 'revokeBadge',
      id: award.id,
      reason: 'Administrator decision',
    });
    synchronizeBadges(revoked);
    expect(earnedBadges(revoked, away).some((a) => a.badgeKey === 'season_champion')).toBe(false);
    expect(state.badgeAwards).toHaveLength(3);
  });
  it('publishes only earned summaries and filters pending claims by participation', () => {
    const { state, award, fixture, home, away } = submitted();
    const stranger = state.players.find((p) => p.id !== home && p.id !== away)!;
    stranger.role = 'player';
    state.currentUserId = stranger.id;
    expect(privateSnapshot(state).badgeAwards).toEqual([]);
    expect(publicSnapshot(state).publicBadges).toEqual([]);
    state.currentUserId = away;
    const badgeOnly = executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true });
    badgeOnly.currentUserId = stranger.id;
    expect(privateSnapshot(badgeOnly).badgeAwards).toEqual([]);
    expect(privateSnapshot(badgeOnly).publicBadges).toEqual([]);
    const confirmed = executeCommand(
      executeCommand(state, { type: 'reviewBadge', id: award.id, approve: true }),
      { type: 'review', fixtureId: fixture.id, approve: true, reason: '' },
    );
    const publicState = publicSnapshot(confirmed);
    confirmed.currentUserId = stranger.id;
    expect(privateSnapshot(confirmed).badgeAwards).toEqual([]);
    expect(privateSnapshot(confirmed).publicBadges).toHaveLength(1);
    expect(publicState.badgeAwards).toBeUndefined();
    expect(publicState.publicBadges).toHaveLength(1);
    expect(publicState.publicBadges![0]).not.toHaveProperty('history');
    expect(publicState.publicBadges![0]).not.toHaveProperty('submissionId');
    const row = displaySnapshot(confirmed).standings.find((r) => r.id === fixture.homeId)!;
    expect(row.badges).toEqual(['break_dish']);
  });
  it('rejects unknown badges, forged approval fields and non-UUID recipients at the API boundary', () => {
    expect(
      commandSchema.safeParse({
        type: 'grantBadge',
        playerId: crypto.randomUUID(),
        badgeKey: 'first_win',
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'reviewBadge',
        id: crypto.randomUUID(),
        approve: true,
        actorId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'grantBadge', playerId: 'forged', badgeKey: 'seven_ball' })
        .success,
    ).toBe(false);
  });
});
