import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { LeagueState } from '../../src/domain/types';
import { recentResults } from '../../src/domain/recentResults';

export async function readState(client: PoolClient, actorId = ''): Promise<LeagueState> {
  const rows = async <T>(sql: string) =>
    (await client.query<T & Record<string, unknown>>(sql)).rows as T[];
  const players = await rows<LeagueState['players'][number]>(
    'SELECT id,name,department,role,active,color FROM public.profiles ORDER BY id',
  );
  const participants = await rows<LeagueState['participants'][number]>(`SELECT id,name,kind,
    coalesce((SELECT json_agg(profile_id ORDER BY member_order) FROM public.participant_members WHERE participant_id=p.id),'[]') AS "playerIds" FROM public.participants p ORDER BY id`);
  const seasons = await rows<
    LeagueState['seasons'][number]
  >(`SELECT id,name,start_date::text AS "startDate",format,status,
    json_build_object('roundsPerWeek',rounds_per_week) AS config,
    coalesce((SELECT json_agg(participant_id ORDER BY entry_order) FROM public.season_participants WHERE season_id=s.id),'[]') AS "participantIds",
    coalesce((SELECT json_agg(participant_id ORDER BY seed) FROM public.season_qualifiers WHERE season_id=s.id),'[]') AS qualifiers,
    champion_id AS "championId", finalized_reason AS "finalizedReason" FROM public.seasons s ORDER BY start_date DESC,id`);
  const fixtures = await rows<
    LeagueState['fixtures'][number]
  >(`SELECT id,season_id AS "seasonId",round,home_id AS "homeId",away_id AS "awayId",due_date::text AS "dueDate",stage,best_of AS "bestOf",status,
    CASE WHEN home_score IS NULL THEN NULL ELSE json_build_object('home',home_score,'away',away_score) END AS score,
    submitted_by AS "submittedBy",note,revision::integer,bracket_slot AS "bracketSlot",
    coalesce((SELECT json_agg(json_build_object('id',e.id,'actorId',actor_id,'action',action,'at',occurred_at,'reason',reason,
      'score',CASE WHEN e.home_score IS NULL THEN NULL ELSE json_build_object('home',e.home_score,'away',e.away_score) END) ORDER BY fixture_revision) FROM public.result_events e WHERE fixture_id=f.id),'[]') AS history
    FROM public.fixtures f ORDER BY season_id,round,bracket_slot NULLS LAST,id`);
  const bookings = await rows<
    LeagueState['bookings'][number]
  >(`SELECT id,owner_id AS "ownerId",kind,fixture_id AS "fixtureId",start_at AS "startAt",duration,status,created_at AS "createdAt",updated_at AS "updatedAt",revision::integer,
    coalesce((SELECT json_agg(profile_id ORDER BY guest_order) FROM public.booking_guests WHERE booking_id=b.id),'[]') AS "guestIds" FROM public.table_bookings b ORDER BY start_at,id`);
  const [bookingConfig] = await rows<LeagueState['bookingConfig']>(
    `SELECT time_zone AS "timeZone",to_char(opens_at,'HH24:MI') AS "opensAt",to_char(closes_at,'HH24:MI') AS "closesAt",weekdays FROM public.booking_settings`,
  );
  if (!bookingConfig)
    throw new Error('Booking settings are missing. Apply the reviewed database migration.');
  const availability = await rows<LeagueState['availability'][number]>(
    `SELECT id,profile_id AS "playerId",from_date::text AS "from",to_date::text AS "to",reason FROM public.availability ORDER BY id`,
  );
  const notifications = await rows<LeagueState['notifications'][number]>(
    `SELECT id,user_id AS "userId",season_id AS "seasonId",kind,title,body,fixture_id AS "fixtureId",created_at AS "createdAt",read_at IS NOT NULL AS read FROM public.notifications ORDER BY created_at DESC,id`,
  );
  const announcements = await rows<LeagueState['announcements'][number]>(
    `SELECT id,season_id AS "seasonId",title,body,created_at AS "createdAt" FROM public.announcements ORDER BY created_at DESC,id`,
  );
  const [{ enabled: casualResultsEnabled }] = await rows<{ enabled: boolean }>(
    `SELECT to_regclass('public.casual_results') IS NOT NULL AS enabled`,
  );
  const casualResults = casualResultsEnabled
    ? await rows<NonNullable<LeagueState['casualResults']>[number]>(
        `SELECT id, array_remove(ARRAY[home_player_id,home_partner_id],NULL) AS "homePlayerIds",
      array_remove(ARRAY[away_player_id,away_partner_id],NULL) AS "awayPlayerIds",
      played_on::text AS "playedOn",best_of AS "bestOf",status,
      json_build_object('home',home_score,'away',away_score) AS score,
      submitted_by AS "submittedBy",history FROM public.casual_results ORDER BY played_on DESC,id`,
      )
    : [];
  // JSON serialization also normalizes pg timestamptz Date objects to the frontend's ISO contract.
  const state: LeagueState = JSON.parse(
    JSON.stringify({
      version: 3,
      players,
      participants,
      seasons,
      fixtures,
      bookings,
      bookingConfig,
      availability,
      notifications,
      announcements,
      casualResults,
      casualResultsEnabled,
      currentUserId: actorId,
      selectedSeasonId: seasons[0]?.id ?? '',
      theme: 'dark',
    }),
  );
  state.revision = createHash('sha256')
    .update(JSON.stringify({ ...state, currentUserId: '' }))
    .digest('hex');
  return state;
}
export function privateSnapshot(state: LeagueState): LeagueState {
  const actor = state.players.find((p) => p.id === state.currentUserId)!;
  return {
    ...state,
    recentResults: recentResults(state, 6),
    casualResults: (state.casualResults ?? []).filter(
      (r) =>
        actor.role === 'admin' ||
        r.status === 'confirmed' ||
        [...r.homePlayerIds, ...r.awayPlayerIds].includes(actor.id),
    ),
    notifications: state.notifications.filter((n) => n.userId === actor.id),
    availability:
      actor.role === 'admin'
        ? state.availability
        : state.availability.filter((a) => a.playerId === actor.id),
  };
}
