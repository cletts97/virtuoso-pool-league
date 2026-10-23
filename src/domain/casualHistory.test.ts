import { describe, it, expect } from 'vitest';
import { compareCasualHistory, casualSubmittedAt } from './casual';
import type { CasualResult } from './types';
import { publicSnapshot } from '../data/publicSnapshot';
import { createSeed } from '../data/seed';
function result(id: string, at: string): CasualResult {
  return {
    id,
    homePlayerIds: ['p01'],
    awayPlayerIds: ['p02'],
    playedOn: at.slice(0, 10),
    bestOf: 3,
    score: { home: 2, away: 1 },
    status: 'confirmed',
    history: [{ id: 'submitted', actorId: 'p01', action: 'submitted', at }],
  };
}
describe('casual game history ordering', () => {
  it('orders by playing day then latest submission, independently of random UUID order', () => {
    const early = result('zzz', '2026-10-23T09:00:00Z');
    const recent = result('aaa', '2026-10-23T10:00:00Z');
    const yesterday = result('xxx', '2026-10-22T23:00:00Z');
    early.history.push({
      id: 'review',
      actorId: 'p02',
      action: 'approved',
      at: '2026-10-23T11:00:00Z',
    });
    expect([early, yesterday, recent].sort(compareCasualHistory).map((r) => r.id)).toEqual([
      'aaa',
      'zzz',
      'xxx',
    ]);
    early.history.push({
      id: 'resubmit',
      actorId: 'p01',
      action: 'submitted',
      at: '2026-10-23T12:00:00Z',
    });
    expect([recent, early].sort(compareCasualHistory)[0].id).toBe('zzz');
  });
  it('preserves chronological ordering in public responses without exposing audit identities', () => {
    const state = createSeed();
    state.casualResults = [
      result('zzz', '2026-10-23T09:00:00Z'),
      result('aaa', '2026-10-23T10:00:00Z'),
    ];
    const snapshot = publicSnapshot(state);
    expect(snapshot.casualResults!.every((r) => r.history.length === 0)).toBe(true);
    expect(snapshot.casualResults!.sort(compareCasualHistory).map((r) => r.id)).toEqual([
      'aaa',
      'zzz',
    ]);
    expect(casualSubmittedAt({ ...state.casualResults[0], history: [] })).toBe(
      '2026-10-23T00:00:00Z',
    );
  });
});
