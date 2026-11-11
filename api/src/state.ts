import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { LeagueState } from '../../src/domain/types';
import { recentResults } from '../../src/domain/recentResults';
import { londonDate } from '../../src/domain/bookings';
import { addDays } from '../../src/domain/rules';

/** Full command state by default. Public reads omit private collections and keep
 * only first-submission/latest-event timestamps needed by existing public views.
 * Never use the smaller projection for mutation validation.
 */
export async function readState(
  client: PoolClient,
  actorId = '',
  publicOnly = false,
  now = new Date(),
): Promise<LeagueState> {
  const rows = async <T>(sql: string, values: unknown[] = []) =>
    (await client.query<T & Record<string, unknown>>(sql, values)).rows as T[];
  const players = await rows<LeagueState['players'][number]>(
    publicOnly
      ? "SELECT id,name,'' AS department,'player' AS role,active,color FROM public.profiles ORDER BY id"
      : 'SELECT id,name,department,role,active,color,(auth_user_id IS NULL) AS deleted FROM public.profiles ORDER BY id',
  );
  const participants = await rows<LeagueState['participants'][number]>(`SELECT id,name,kind,
    coalesce((SELECT json_agg(profile_id ORDER BY member_order) FROM public.participant_members WHERE participant_id=p.id),'[]') AS "playerIds" FROM public.participants p ORDER BY id`);
  const seasons = await rows<
    LeagueState['seasons'][number]
  >(`SELECT id,name,start_date::text AS "startDate",format,status,
    json_build_object('roundsPerWeek',rounds_per_week) AS config,
    coalesce((SELECT json_agg(participant_id ORDER BY entry_order) FROM public.season_participants WHERE season_id=s.id),'[]') AS "participantIds",
    coalesce((SELECT json_agg(participant_id ORDER BY seed) FROM public.season_qualifiers WHERE season_id=s.id),'[]') AS qualifiers,
    champion_id AS "championId"${publicOnly ? '' : ', finalized_reason AS "finalizedReason"'} FROM public.seasons s ${publicOnly ? "WHERE status<>'draft'" : ''} ORDER BY start_date DESC,id`);
  const fixtures = await rows<
    LeagueState['fixtures'][number]
  >(`SELECT id,season_id AS "seasonId",round,home_id AS "homeId",away_id AS "awayId",due_date::text AS "dueDate",stage,best_of AS "bestOf",status,
    CASE WHEN home_score IS NULL THEN NULL ELSE json_build_object('home',home_score,'away',away_score) END AS score,
    ${publicOnly ? '' : 'submitted_by AS "submittedBy",note,revision::integer,'}bracket_slot AS "bracketSlot",
    coalesce((SELECT json_agg(json_build_object('id',e.id,'actorId',${publicOnly ? 'NULL' : 'actor_id'},'action',action,'at',occurred_at${publicOnly ? '' : ",'reason',reason,'score',CASE WHEN e.home_score IS NULL THEN NULL ELSE json_build_object('home',e.home_score,'away',e.away_score) END"}) ORDER BY fixture_revision)
      FROM public.result_events e WHERE fixture_id=f.id ${
        publicOnly
          ? `AND fixture_revision IN (
        (SELECT min(fixture_revision) FROM public.result_events WHERE fixture_id=f.id AND action='submitted'),
        (SELECT max(fixture_revision) FROM public.result_events WHERE fixture_id=f.id))`
          : ''
      }),'[]') AS history
    FROM public.fixtures f ${publicOnly ? "WHERE season_id IN (SELECT id FROM public.seasons WHERE status<>'draft')" : ''} ORDER BY season_id,round,bracket_slot NULLS LAST,id`);
  const bookings = await rows<LeagueState['bookings'][number]>(
    `SELECT id,owner_id AS "ownerId",kind,sport,fixture_id AS "fixtureId",start_at AS "startAt",duration,status,created_at AS "createdAt",updated_at AS "updatedAt",revision::integer,
    coalesce((SELECT json_agg(profile_id ORDER BY guest_order) FROM public.booking_guests WHERE booking_id=b.id),'[]') AS "guestIds" FROM public.table_bookings b ${publicOnly ? "WHERE status='reserved' AND (start_at AT TIME ZONE 'Europe/London')::date BETWEEN $1::date AND $2::date" : ''} ORDER BY start_at,id`,
    publicOnly ? [londonDate(now), addDays(londonDate(now), 7)] : [],
  );
  const [bookingConfig] = await rows<LeagueState['bookingConfig']>(
    `SELECT time_zone AS "timeZone",to_char(opens_at,'HH24:MI') AS "opensAt",to_char(closes_at,'HH24:MI') AS "closesAt",weekdays FROM public.booking_settings`,
  );
  if (!bookingConfig)
    throw new Error('Booking settings are missing. Apply the reviewed database migration.');
  const availability = publicOnly
    ? []
    : await rows<LeagueState['availability'][number]>(
        `SELECT id,profile_id AS "playerId",from_date::text AS "from",to_date::text AS "to",reason FROM public.availability ORDER BY id`,
      );
  const notifications = publicOnly
    ? []
    : await rows<LeagueState['notifications'][number]>(
        `SELECT id,user_id AS "userId",season_id AS "seasonId",kind,title,body,fixture_id AS "fixtureId",casual_result_id AS "casualResultId",join_request_id AS "joinRequestId",created_at AS "createdAt",read_at IS NOT NULL AS read FROM public.notifications ORDER BY created_at DESC,id`,
      );
  const joinRequests = publicOnly
    ? []
    : await rows<NonNullable<LeagueState['joinRequests']>[number]>(
        `SELECT id,season_id AS "seasonId",player_id AS "playerId",status,created_at AS "createdAt",reviewed_at AS "reviewedAt",reviewed_by AS "reviewedBy" FROM public.season_join_requests ORDER BY created_at,id`,
      );
  const announcements = await rows<LeagueState['announcements'][number]>(
    `SELECT id,season_id AS "seasonId",title,body,created_at AS "createdAt" FROM public.announcements ${publicOnly ? "WHERE season_id IN (SELECT id FROM public.seasons WHERE status<>'draft')" : ''} ORDER BY created_at DESC,id`,
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
      ${
        publicOnly
          ? `coalesce((SELECT json_agg(json_build_object('id',event->>'id','actorId',NULL,'action',event->>'action','at',event->>'at') ORDER BY position)
        FROM jsonb_array_elements(history) WITH ORDINALITY AS e(event,position)
        WHERE position=jsonb_array_length(history) OR position=(SELECT max(n) FROM jsonb_array_elements(history) WITH ORDINALITY AS s(item,n) WHERE item->>'action'='submitted')),'[]') AS history`
          : 'submitted_by AS "submittedBy",history'
      }
      FROM public.casual_results ORDER BY played_on DESC,id`,
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
      joinRequests,
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
    joinRequests: (state.joinRequests ?? []).filter(
      (r) => actor.role === 'admin' || r.playerId === actor.id,
    ),
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
