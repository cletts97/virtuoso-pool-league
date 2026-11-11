import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { createSeed } from '../../src/data/seed';
import { readState } from '../src/state';
import { StateCache, stateFingerprint } from '../src/stateCache';

vi.mock('../src/state', () => ({ readState: vi.fn() }));
const fixture = () => {
  let key = 'version-one';
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('to_regclass') ? [{ casual: true }] : [{ fingerprint: key }],
  }));
  return {
    client: { query } as unknown as PoolClient,
    query,
    change: () => {
      key = 'version-two';
    },
  };
};
beforeEach(() => {
  vi.mocked(readState).mockReset();
  vi.mocked(readState).mockResolvedValue(createSeed());
});

describe('bounded server snapshot cache', () => {
  it('checks the database but transfers no full snapshot on unchanged polls', async () => {
    const { client, query } = fixture(),
      cache = new StateCache();
    const first = await cache.read(client, true);
    expect(await cache.read(client, true)).toBe(first);
    expect(readState).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it('invalidates on a changed fingerprint and isolates public/full cache entries', async () => {
    const { client, change } = fixture(),
      cache = new StateCache();
    await cache.read(client, true);
    await cache.read(client, false);
    expect(readState).toHaveBeenCalledTimes(2);
    change();
    await cache.read(client, true);
    await cache.read(client, false);
    expect(readState).toHaveBeenCalledTimes(4);
    expect(vi.mocked(readState).mock.calls.map((args) => args[2])).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
  it('refreshes the public booking window at London midnight, not UTC midnight', async () => {
    const { client } = fixture(),
      cache = new StateCache();
    await cache.read(client, true, new Date('2026-07-01T22:59:00Z'));
    await cache.read(client, true, new Date('2026-07-01T23:01:00Z'));
    expect(readState).toHaveBeenCalledTimes(2);
    await cache.read(client, true, new Date('2026-07-02T00:01:00Z'));
    expect(readState).toHaveBeenCalledTimes(2);
  });
  it('does not cache failed loads or serve stale availability when fingerprint lookup fails', async () => {
    const { client, query, change } = fixture(),
      cache = new StateCache();
    await cache.read(client, true);
    change();
    vi.mocked(readState).mockRejectedValueOnce(new Error('offline'));
    await expect(cache.read(client, true)).rejects.toThrow('offline');
    await cache.read(client, true);
    expect(readState).toHaveBeenCalledTimes(3);
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(cache.read(client, true)).rejects.toThrow('database unavailable');
  });
  it('fingerprints child rows and deletes without transferring them; excludes private/outbox tables for TV', async () => {
    const { client, query } = fixture();
    await stateFingerprint(client, true);
    const publicSql = query.mock.calls[1][0];
    for (const table of [
      'participant_members',
      'booking_guests',
      'season_qualifiers',
      'fixtures',
      'result_events',
      'casual_results',
    ])
      expect(publicSql).toContain(`public.${table}`);
    for (const table of [
      'notifications',
      'season_join_requests',
      'availability',
      'result_email_outbox',
    ])
      expect(publicSql).not.toContain(`public.${table}`);
    await stateFingerprint(client, false);
    expect(query.mock.calls[3][0]).toContain('public.notifications');
  });
  it('supports installations without the optional casual-results table', async () => {
    const { client, query } = fixture();
    query.mockResolvedValueOnce({ rows: [{ casual: false }] } as never);
    await stateFingerprint(client, true);
    expect(query.mock.calls[1][0]).not.toContain('public.casual_results');
  });
});
