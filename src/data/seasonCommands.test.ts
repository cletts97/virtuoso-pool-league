import { describe, it, expect } from 'vitest';
import { executeCommand } from './commands';
import { createSeed } from './seed';
import { standings, dateOnly, addDays } from '../domain/rules';
import { LocalLeagueRepository, STORAGE_KEY } from './localRepository';

function draft() {
  return executeCommand(createSeed(), {
    type: 'createSeason',
    name: 'Disposable season',
    startDate: dateOnly(),
    participantIds: ['p01', 'p02', 'p03', 'p04'],
    roundsPerWeek: 2,
  });
}
describe('season management', () => {
  it('adds players to an existing draft before generating fixtures', () => {
    const before = draft(),
      id = before.selectedSeasonId;
    const next = executeCommand(before, {
      type: 'addSeasonPlayer',
      seasonId: id,
      playerId: 'colleague-01',
      dueDate: addDays(dateOnly(), 14),
    });
    expect(next.seasons.find((s) => s.id === id)!.participantIds).toHaveLength(5);
    expect(next.fixtures).toEqual(before.fixtures);
    const published = executeCommand(next, { type: 'generate', seasonId: id });
    expect(published.fixtures.filter((f) => f.seasonId === id)).toHaveLength(10);
  });
  it('deletes unused published fixtures, notices and enrollment without deleting accounts', () => {
    let before = draft();
    const id = before.selectedSeasonId;
    before = executeCommand(before, { type: 'generate', seasonId: id });
    const next = executeCommand(before, {
      type: 'deleteSeason',
      seasonId: id,
      confirmName: 'Disposable season',
    });
    expect(next.seasons.some((s) => s.id === id)).toBe(false);
    expect(next.fixtures.some((f) => f.seasonId === id)).toBe(false);
    expect(next.notifications.some((n) => n.seasonId === id)).toBe(false);
    expect(next.players).toEqual(before.players);
    expect(next.participants).toEqual(before.participants);
    expect(next.seasons.some((s) => s.id === next.selectedSeasonId)).toBe(true);
  });
  it('requires administrator identity and exact name, and preserves audited seasons/bookings', () => {
    const before = draft(),
      id = before.selectedSeasonId;
    const command = {
      type: 'deleteSeason' as const,
      seasonId: id,
      confirmName: 'Disposable season',
    };
    expect(() => executeCommand({ ...before, currentUserId: 'p02' }, command)).toThrow(
      'Administrator',
    );
    expect(() => executeCommand(before, { ...command, confirmName: 'wrong' })).toThrow('exactly');
    const current = before.seasons.find((s) => s.status === 'regular')!;
    expect(() =>
      executeCommand(before, { ...command, seasonId: current.id, confirmName: current.name }),
    ).toThrow('history');
    const published = executeCommand(before, { type: 'generate', seasonId: id });
    published.bookings.push({
      ...published.bookings[0],
      id: 'linked',
      fixtureId: published.fixtures.find((f) => f.seasonId === id)!.id,
    });
    expect(() => executeCommand(published, command)).toThrow('bookings');
    expect(() => executeCommand({ ...before, readOnly: true }, command)).toThrow('active');
  });
  it('ends an in-progress season without seeding playoffs or changing approved standings', () => {
    const before = createSeed(),
      season = before.seasons.find((s) => s.status === 'regular')!;
    const table = standings(season, before.fixtures);
    const fixture = before.fixtures.find(
      (f) => f.seasonId === season.id && f.status === 'scheduled',
    )!;
    before.bookings.push({
      ...before.bookings[0],
      id: 'linked',
      fixtureId: fixture.id,
      startAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'reserved',
    });
    const confirmed = structuredClone(
      before.fixtures.filter((f) => f.seasonId === season.id && f.status === 'confirmed'),
    );
    const next = executeCommand(before, {
      type: 'endSeason',
      seasonId: season.id,
      reason: 'This was a test season',
    });
    const closed = next.seasons.find((s) => s.id === season.id)!;
    expect(closed.status).toBe('complete');
    expect(closed.championId).toBeUndefined();
    expect(closed.qualifiers).toEqual([]);
    expect(
      next.fixtures.filter((f) => f.seasonId === season.id && f.status === 'confirmed'),
    ).toEqual(confirmed);
    expect(standings(closed, next.fixtures)).toEqual(table);
    expect(
      next.fixtures
        .filter((f) => f.seasonId === season.id)
        .every((f) => ['confirmed', 'cancelled'].includes(f.status)),
    ).toBe(true);
    expect(next.bookings.find((b) => b.id === 'linked')!.status).toBe('cancelled');
    expect(next.fixtures).toHaveLength(before.fixtures.length);
    expect(() =>
      executeCommand(next, { type: 'endSeason', seasonId: season.id, reason: 'again' }),
    ).toThrow('already');
    expect(() =>
      executeCommand(before, { type: 'endSeason', seasonId: season.id, reason: '' }),
    ).toThrow('reason');
  });
  it('reloads demo state after deleting its final season', async () => {
    const state = draft(),
      id = state.selectedSeasonId;
    state.seasons = state.seasons.filter((s) => s.id === id);
    state.fixtures = [];
    state.notifications = [];
    state.announcements = [];
    state.bookings = [];
    const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
    const repo = new LocalLeagueRepository({
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
    });
    await repo.execute({ type: 'deleteSeason', seasonId: id, confirmName: 'Disposable season' });
    expect((await repo.load()).seasons).toEqual([]);
    expect((await repo.load()).selectedSeasonId).toBe('');
  });
});
