import { describe, it, expect } from 'vitest';
import { createSeed } from '../data/seed';
import { recentResults } from './recentResults';
import { publicSnapshot } from '../data/publicSnapshot';
import { displaySnapshot } from '../data/display';
import { standings } from './rules';
describe('combined result feed', () => {
  it('includes pending league and disputed doubles without leaking history or changing standings', () => {
    const state = createSeed(),
      season = state.seasons[0];
    const before = standings(season, state.fixtures);
    const pending = state.fixtures.find((f) => f.status === 'pending')!;
    pending.history.push({
      id: 'private',
      actorId: 'SECRET_ACTOR',
      action: 'submitted',
      reason: 'SECRET_REASON',
      at: '2099-01-01T00:00:00Z',
    });
    state.casualResults = [
      {
        id: 'casual',
        homePlayerIds: ['p01', 'p02'],
        awayPlayerIds: ['p03', 'p04'],
        playedOn: '2026-01-01',
        bestOf: 3,
        score: { home: 2, away: 1 },
        status: 'disputed',
        submittedBy: 'SECRET_SUBMITTER',
        history: [
          {
            id: 'private2',
            actorId: 'SECRET_ACTOR',
            action: 'disputed',
            reason: 'SECRET_REASON',
            at: '2099-01-02T00:00:00Z',
          },
        ],
      },
    ];
    const feed = recentResults(state);
    expect(feed[0]).toMatchObject({
      id: 'casual',
      kind: 'casual',
      format: 'doubles',
      status: 'disputed',
      homeScore: 2,
    });
    expect(feed[1]).toMatchObject({ id: pending.id, kind: 'league', status: 'pending' });
    expect(JSON.stringify(feed)).not.toContain('SECRET');
    const published = publicSnapshot(state);
    expect(published.casualResults).toEqual([]);
    expect(published.fixtures.find((f) => f.id === pending.id)!.score).toBeUndefined();
    expect(recentResults(published)).toEqual(feed);
    expect(displaySnapshot(state).results.slice(0, 3)).toEqual(feed);
    expect(standings(season, state.fixtures)).toEqual(before);
  });
  it('excludes unpublished drafts and orders ties deterministically', () => {
    const state = createSeed();
    state.seasons.forEach((s) => {
      s.status = 'draft';
    });
    expect(recentResults(state)).toEqual([]);
  });
});
