import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { LeagueState } from '../../src/domain/types';
import { bookingEnd } from '../../src/domain/bookings';

const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
/** The mock scheduler uses readable IDs; real relational records always receive UUIDs. */
export function normalizeNewIds(before: LeagueState, next: LeagueState): void {
  const ids = new Map<string, string>();
  for (const f of next.fixtures)
    if (!before.fixtures.some((old) => old.id === f.id)) {
      if (f.stage !== 'regular') f.bracketSlot = f.id.endsWith('-sf2') ? 2 : 1;
      ids.set(f.id, randomUUID());
    }
  for (const f of next.fixtures) f.id = ids.get(f.id) ?? f.id;
  for (const n of next.notifications)
    if (n.fixtureId) n.fixtureId = ids.get(n.fixtureId) ?? n.fixtureId;
}
export async function persistChanges(
  client: PoolClient,
  before: LeagueState,
  next: LeagueState,
): Promise<void> {
  // Table and column names below are code-owned constants; all values are bound parameters.
  const upsert = async (table: string, row: Record<string, unknown>, key = 'id') => {
    const columns = Object.keys(row),
      values = Object.values(row).map((v) => v ?? null);
    return client.query(
      `INSERT INTO public.${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (${key}) DO UPDATE SET ${columns
        .filter((k) => k !== key)
        .map((k) => `${k}=EXCLUDED.${k}`)
        .join(',')} RETURNING *`,
      values,
    );
  };
  for (const p of next.players)
    if (
      changed(
        p,
        before.players.find((o) => o.id === p.id),
      )
    ) {
      // Auth creates profiles. This path can only update an existing profile.
      await client.query(
        'UPDATE public.profiles SET name=$2,department=$3,role=$4,active=$5,color=$6 WHERE id=$1',
        [p.id, p.name, p.department, p.role, p.active, p.color],
      );
    }
  for (const p of next.participants) {
    const old = before.participants.find((o) => o.id === p.id);
    if (changed(p, old)) await upsert('participants', { id: p.id, name: p.name, kind: p.kind });
    if (!old)
      for (const [i, id] of p.playerIds.entries())
        await client.query(
          'INSERT INTO public.participant_members(participant_id,profile_id,member_order) VALUES($1,$2,$3)',
          [p.id, id, i + 1],
        );
  }
  for (const s of next.seasons) {
    const old = before.seasons.find((o) => o.id === s.id);
    if (changed(s, old))
      await upsert('seasons', {
        id: s.id,
        name: s.name,
        start_date: s.startDate,
        format: s.format,
        status: s.status,
        rounds_per_week: s.config.roundsPerWeek,
        champion_id: s.championId,
        finalized_reason: s.finalizedReason,
        ...(s.qualifiers.length && !old?.qualifiers.length
          ? { finalized_at: new Date().toISOString(), finalized_by: next.currentUserId }
          : {}),
      });
    for (const [i, id] of s.participantIds.entries())
      if (!old?.participantIds.includes(id))
        await client.query(
          'INSERT INTO public.season_participants(season_id,participant_id,entry_order) VALUES($1,$2,$3)',
          [s.id, id, i],
        );
    if (s.qualifiers.length && !old?.qualifiers.length)
      for (const [i, id] of s.qualifiers.entries())
        await client.query(
          'INSERT INTO public.season_qualifiers(season_id,seed,participant_id) VALUES($1,$2,$3)',
          [s.id, i + 1, id],
        );
  }
  for (const f of next.fixtures) {
    const old = before.fixtures.find((o) => o.id === f.id);
    if (!changed(f, old)) continue;
    const confirmation = [...f.history]
      .reverse()
      .find((h) => h.action === 'approved' || h.action === 'corrected');
    const confirmed = f.status === 'confirmed';
    const result = await upsert('fixtures', {
      id: f.id,
      season_id: f.seasonId,
      round: f.round,
      home_id: f.homeId,
      away_id: f.awayId,
      due_date: f.dueDate,
      stage: f.stage,
      bracket_slot: f.bracketSlot,
      best_of: f.bestOf,
      status: f.status,
      home_score: f.score?.home,
      away_score: f.score?.away,
      submitted_by: f.submittedBy,
      note: f.note,
      confirmed_by: confirmed ? confirmation?.actorId : null,
      confirmed_at: confirmed ? confirmation?.at : null,
      confirmation_kind: confirmed
        ? confirmation?.action === 'corrected'
          ? 'admin_override'
          : 'opponent'
        : null,
      override_reason:
        confirmed && confirmation?.action === 'corrected' ? confirmation.reason : null,
    });
    const events = f.history.filter((h) => !old?.history.some((o) => o.id === h.id));
    if (events.length > 1) throw new Error('Each fixture transition must append one event.');
    for (const e of events)
      await client.query(
        `INSERT INTO public.result_events(id,fixture_id,fixture_revision,action,actor_id,home_score,away_score,occurred_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          e.id,
          f.id,
          result.rows[0].revision,
          e.action,
          e.actorId,
          e.score?.home ?? null,
          e.score?.away ?? null,
          e.at,
          e.reason ?? null,
        ],
      );
  }
  for (const b of next.bookings) {
    const old = before.bookings.find((o) => o.id === b.id);
    if (!changed(b, old)) continue;
    await upsert('table_bookings', {
      id: b.id,
      owner_id: b.ownerId,
      kind: b.kind,
      fixture_id: b.fixtureId,
      start_at: b.startAt,
      end_at: bookingEnd(b),
      duration: b.duration,
      status: b.status,
      created_at: b.createdAt,
    });
    await client.query('DELETE FROM public.booking_guests WHERE booking_id=$1', [b.id]);
    for (const [i, id] of b.guestIds.entries())
      await client.query(
        'INSERT INTO public.booking_guests(booking_id,profile_id,guest_order) VALUES($1,$2,$3)',
        [b.id, id, i],
      );
  }
  if (changed(next.bookingConfig, before.bookingConfig))
    await upsert(
      'booking_settings',
      {
        singleton: true,
        time_zone: next.bookingConfig.timeZone,
        opens_at: next.bookingConfig.opensAt,
        closes_at: next.bookingConfig.closesAt,
        weekdays: next.bookingConfig.weekdays,
      },
      'singleton',
    );
  for (const a of next.availability)
    if (!before.availability.some((o) => o.id === a.id))
      await upsert('availability', {
        id: a.id,
        profile_id: a.playerId,
        from_date: a.from,
        to_date: a.to,
        reason: a.reason,
      });
  for (const a of before.availability)
    if (!next.availability.some((o) => o.id === a.id))
      await client.query('DELETE FROM public.availability WHERE id=$1', [a.id]);
  for (const n of next.notifications) {
    const old = before.notifications.find((o) => o.id === n.id);
    if (!old)
      await client.query(
        `INSERT INTO public.notifications(id,user_id,season_id,kind,title,body,fixture_id,created_at,read_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        [
          n.id,
          n.userId,
          n.seasonId,
          n.kind,
          n.title,
          n.body,
          n.fixtureId ?? null,
          n.createdAt,
          n.read ? new Date().toISOString() : null,
        ],
      );
    else if (n.read && !old.read)
      await client.query(
        'UPDATE public.notifications SET read_at=now() WHERE id=$1 AND user_id=$2',
        [n.id, next.currentUserId],
      );
  }
  for (const a of next.announcements)
    if (!before.announcements.some((o) => o.id === a.id))
      await upsert('announcements', {
        id: a.id,
        season_id: a.seasonId,
        title: a.title,
        body: a.body,
        created_at: a.createdAt,
      });
}
