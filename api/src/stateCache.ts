import type { PoolClient } from 'pg';
import type { LeagueState } from '../../src/domain/types';
import { londonDate } from '../../src/domain/bookings';
import { readState } from './state';

// Code-owned identifiers only. The outbox is deliberately absent: delivery retries
// do not change league data. Include child tables so edits/deletes cannot be missed.
const sharedTables = [
  'profiles',
  'participants',
  'participant_members',
  'seasons',
  'season_participants',
  'season_qualifiers',
  'fixtures',
  'result_events',
  'table_bookings',
  'booking_guests',
  'booking_settings',
  'announcements',
];

/** Hash inside PostgreSQL; only a small digest crosses the Supabase/Azure boundary.
 * No migration or timestamp assumptions: catches inserts, updates and deletes,
 * including SQL maintenance and writes from other Functions instances.
 */
export async function stateFingerprint(client: PoolClient, publicOnly: boolean): Promise<string> {
  const {
    rows: [optional],
  } = await client.query<{ casual: boolean }>(
    "SELECT to_regclass('public.casual_results') IS NOT NULL AS casual",
  );
  const tables = [
    ...sharedTables,
    ...(optional.casual ? ['casual_results'] : []),
    ...(publicOnly ? [] : ['availability', 'notifications', 'season_join_requests']),
  ];
  const digests = tables.map(
    (table) => `(SELECT md5(coalesce(string_agg(h,'' ORDER BY h),''))
    FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t) hashes)`,
  );
  const {
    rows: [row],
  } = await client.query<{ fingerprint: string }>(
    `SELECT md5(concat_ws('|',${digests.join(',')})) AS fingerprint`,
  );
  return row.fingerprint;
}

/** Two bounded, process-local entries. Each use checks the DB in the same repeatable
 * read transaction as a miss. Never use this cache for command validation/writes.
 */
export class StateCache {
  private full?: { key: string; state: LeagueState };
  private public?: { key: string; state: LeagueState };

  async read(client: PoolClient, publicOnly = false, now = new Date()): Promise<LeagueState> {
    const slot = publicOnly ? 'public' : 'full';
    // The public booking window rolls over at London midnight without a DB write.
    const key =
      (await stateFingerprint(client, publicOnly)) + (publicOnly ? `/${londonDate(now)}` : '');
    if (this[slot]?.key === key) return this[slot]!.state;
    const state = await readState(client, '', publicOnly, now);
    this[slot] = { key, state };
    return state;
  }
}
