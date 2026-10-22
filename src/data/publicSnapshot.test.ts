import { describe, expect, it } from 'vitest';
import { publicSnapshot, PUBLIC_VISITOR_ID } from './publicSnapshot';
import { createSeed } from './seed';
import { standings } from '../domain/rules';

describe('anonymous league snapshot', () => {
  it('allows published browsing while removing private fields and draft data', () => {
    const state = createSeed('2026-10-22');
    state.players[0].department = 'PRIVATE_DEPARTMENT';
    state.players[0].avatarUrl = 'https://private-photo.example/SECRET';
    Object.assign(state.players[0], { email: 'SECRET@example.net', auth_user_id: 'SECRET_AUTH' });
    const season = state.seasons.find((s) => s.status !== 'draft')!;
    const fixture = state.fixtures.find((f) => f.seasonId === season.id)!;
    fixture.note = 'SECRET_NOTE';
    fixture.history.push({
      id: 'private-event',
      actorId: state.players[0].id,
      action: 'submitted',
      at: '2026-10-21T12:00:00Z',
      reason: 'SECRET_REASON',
    });
    const draft = {
      ...structuredClone(season),
      id: 'private-draft',
      status: 'draft' as const,
      name: 'SECRET_DRAFT',
      finalizedReason: 'SECRET_FINALIZATION',
    };
    state.seasons.push(draft);
    state.fixtures.push({ ...structuredClone(fixture), id: 'draft-fixture', seasonId: draft.id });
    const result = publicSnapshot(state, new Date('2026-10-22T12:00:00Z'));
    expect(result.readOnly).toBe(true);
    expect(result.currentUserId).toBe(PUBLIC_VISITOR_ID);
    expect(result.revision).toBeUndefined();
    expect(result.notifications).toEqual([]);
    expect(result.availability).toEqual([]);
    expect(result.seasons.some((s) => s.id === draft.id)).toBe(false);
    expect(result.fixtures.some((f) => f.seasonId === draft.id)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE_DEPARTMENT/);
    expect(
      result.players.filter((p) => p.id !== PUBLIC_VISITOR_ID).every((p) => p.role === 'player'),
    ).toBe(true);
    expect(standings(season, result.fixtures)).toEqual(standings(season, state.fixtures));
  });

  it('shows upcoming reservations but never pending scores or cancelled booking records', () => {
    const state = createSeed('2026-10-22');
    const fixture = state.fixtures.find((f) => f.status === 'pending')!;
    const result = publicSnapshot(state, new Date('2026-10-22T12:00:00Z'));
    expect(result.fixtures.find((f) => f.id === fixture.id)?.score).toBeUndefined();
    expect(result.bookings.every((b) => b.status === 'reserved')).toBe(true);
    expect(result.players.find((p) => p.id === PUBLIC_VISITOR_ID)?.active).toBe(false);
  });
});
