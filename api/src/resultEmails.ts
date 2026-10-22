import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueState } from '../../src/domain/types';
import { canApprove, participantName } from '../../src/domain/rules';
import { canReviewCasual } from '../../src/domain/casual';
import { allowedEmail } from './access';
import type { EmailDelivery } from './email';
import type { ScheduledEmailIntent } from './scheduledEmails';

export interface ResultEmailJob {
  id: string;
  event_id: string;
  recipient_id: string;
  match_kind: 'league' | 'casual' | null;
  purpose?: 'review' | 'reminder' | 'newsletter';
  html?: string;
  source_event_id?: string | null;
  match_id: string | null;
  subject: string;
  body: string;
  attempts: number;
}
export function reviewEmailIntents(before: LeagueState, next: LeagueState, appUrl: string) {
  const intents: {
    eventId: string;
    recipientId: string;
    kind: 'league' | 'casual';
    matchId: string;
    subject: string;
    body: string;
  }[] = [];
  const add = (
    eventId: string,
    ids: string[],
    kind: 'league' | 'casual',
    matchId: string,
    home: string,
    away: string,
    homeScore: number,
    awayScore: number,
    disputed = false,
  ) => {
    const url = new URL(
      kind === 'league' ? `/fixtures/${matchId}` : `/casual?result=${matchId}`,
      appUrl,
    ).href;
    for (const recipientId of new Set(ids))
      if (next.players.some((p) => p.id === recipientId && p.active))
        intents.push({
          eventId,
          recipientId,
          kind,
          matchId,
          subject: disputed
            ? 'A pool match result has been disputed'
            : 'Please review a pool match result',
          body: disputed
            ? `A ${kind} result has been disputed and needs administrator review.\n\n${home} ${homeScore} – ${awayScore} ${away}\n\nSign in to review the dispute and result history:\n${url}\n\nDisputed scores do not count towards records. This link does not change the result or bypass sign-in.`
            : `A ${kind} result needs your confirmation.\n\n${home} ${homeScore} – ${awayScore} ${away}\n\nThis score is pending. Sign in to review it, then confirm or dispute it:\n${url}\n\nOnly confirmed results count towards records. This link does not approve the result or bypass sign-in.`,
        });
  };
  for (const f of next.fixtures) {
    const event = f.history.at(-1);
    if (
      !['pending', 'disputed'].includes(f.status) ||
      !f.score ||
      event?.action !== (f.status === 'disputed' ? 'disputed' : 'submitted') ||
      before.fixtures.find((old) => old.id === f.id)?.history.some((h) => h.id === event.id)
    )
      continue;
    add(
      event.id,
      next.players
        .filter((p) =>
          f.status === 'disputed' ? p.role === 'admin' : canApprove(f, p.id, next.participants),
        )
        .map((p) => p.id),
      'league',
      f.id,
      participantName(next, f.homeId),
      participantName(next, f.awayId),
      f.score.home,
      f.score.away,
      f.status === 'disputed',
    );
  }
  for (const r of next.casualResults ?? []) {
    const event = r.history.at(-1);
    if (
      !['pending', 'disputed'].includes(r.status) ||
      event?.action !== (r.status === 'disputed' ? 'disputed' : 'submitted') ||
      before.casualResults?.find((old) => old.id === r.id)?.history.some((h) => h.id === event.id)
    )
      continue;
    const name = (ids: string[]) =>
      ids.map((id) => next.players.find((p) => p.id === id)?.name ?? 'Colleague').join(' & ');
    add(
      event.id,
      next.players
        .filter((p) => (r.status === 'disputed' ? p.role === 'admin' : canReviewCasual(r, p.id)))
        .map((p) => p.id),
      'casual',
      r.id,
      name(r.homePlayerIds),
      name(r.awayPlayerIds),
      r.score.home,
      r.score.away,
      r.status === 'disputed',
    );
  }
  return intents;
}

export class ResultEmailQueue {
  constructor(
    private pool: Pool,
    private auth: SupabaseClient,
    private delivery: EmailDelivery,
    readonly enabled: boolean,
    private appUrl: string,
    private domains: string[],
    private automaticConfirmation = false,
  ) {}
  async enqueue(client: PoolClient, before: LeagueState, next: LeagueState) {
    if (!this.enabled) return;
    for (const i of reviewEmailIntents(before, next, this.appUrl))
      await client.query(
        `INSERT INTO public.result_email_outbox(event_id,recipient_id,match_kind,match_id,subject,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,recipient_id) DO NOTHING`,
        [
          i.eventId,
          i.recipientId,
          i.kind,
          i.matchId,
          i.subject,
          i.body +
            (this.automaticConfirmation && !i.subject.includes('disputed')
              ? '\n\nIf no opponent disputes this result, it will be automatically confirmed 48 hours after submission.'
              : ''),
        ],
      );
  }
  async enqueueScheduled(client: PoolClient, intents: ScheduledEmailIntent[]) {
    if (!this.enabled) return;
    for (const i of intents)
      await client.query(
        'INSERT INTO public.result_email_outbox(event_id,recipient_id,match_kind,match_id,purpose,subject,body,html,source_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(event_id,recipient_id) DO NOTHING',
        [
          i.eventId,
          i.recipientId,
          i.kind,
          i.matchId,
          i.purpose,
          i.subject,
          i.body,
          i.html ?? null,
          i.sourceEventId ?? null,
        ],
      );
  }
  async status() {
    const ready = (
      await this.pool.query("SELECT to_regclass('public.result_email_outbox') IS NOT NULL AS ready")
    ).rows[0].ready as boolean;
    const counts = ready
      ? (
          await this.pool.query(
            `SELECT count(*) FILTER(WHERE status IN ('pending','sending'))::int AS pending,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='sent')::int AS sent FROM public.result_email_outbox`,
          )
        ).rows[0]
      : { pending: 0, failed: 0, sent: 0 };
    return { enabled: this.enabled, ready, ...counts };
  }
  private async stillReviewable(job: ResultEmailJob, role: string) {
    // Active profile and invited/confirmed Auth identity are checked by flush.
    if (job.purpose === 'newsletter') {
      const { rows } = await this.pool.query(
        "SELECT 1 FROM public.fixtures f JOIN public.seasons s ON s.id=f.season_id WHERE s.status IN ('regular','playoffs') AND f.status IN ('scheduled','postponed') AND f.due_date>=date_trunc('week',now() AT TIME ZONE 'Europe/London')::date AND f.due_date<date_trunc('week',now() AT TIME ZONE 'Europe/London')::date+7 LIMIT 1",
      );
      return rows.length > 0;
    }
    // The immutable event identifies review requests vs administrator dispute alerts.
    // Recheck the role at delivery time so demoted administrators cannot receive alerts.
    if (role === 'admin') {
      const sql =
        job.match_kind === 'league'
          ? `SELECT 1 FROM public.fixtures f JOIN public.result_events e ON e.fixture_id=f.id AND e.id=$2 AND e.action='disputed'
          WHERE f.id=$1 AND f.status='disputed' AND e.fixture_revision=(SELECT max(fixture_revision) FROM public.result_events WHERE fixture_id=f.id)`
          : `SELECT 1 FROM public.casual_results WHERE id=$1 AND status='disputed' AND history->-1->>'id'=$2 AND history->-1->>'action'='disputed'`;
      if (
        (await this.pool.query(sql, [job.match_id, job.source_event_id ?? job.event_id])).rows
          .length
      )
        return true;
    }
    if (job.match_kind === 'league') {
      const { rows } = await this.pool.query(
        `SELECT 1 FROM public.fixtures f
        JOIN public.participant_members mine ON mine.participant_id IN (f.home_id,f.away_id) AND mine.profile_id=$2
        JOIN public.participant_members sender ON sender.participant_id IN (f.home_id,f.away_id) AND sender.profile_id=f.submitted_by
        WHERE f.id=$1 AND f.status='pending' AND mine.participant_id<>sender.participant_id
        AND (SELECT e.id FROM public.result_events e WHERE fixture_id=f.id ORDER BY fixture_revision DESC LIMIT 1)=$3`,
        [job.match_id, job.recipient_id, job.source_event_id ?? job.event_id],
      );
      return rows.length > 0;
    }
    const { rows } = await this.pool.query(
      `SELECT 1 FROM public.casual_results WHERE id=$1 AND status='pending'
      AND (history->-1->>'id')=$3 AND
      (($2=ANY(array_remove(ARRAY[home_player_id,home_partner_id],NULL)) AND submitted_by=ANY(array_remove(ARRAY[away_player_id,away_partner_id],NULL))) OR
       ($2=ANY(array_remove(ARRAY[away_player_id,away_partner_id],NULL)) AND submitted_by=ANY(array_remove(ARRAY[home_player_id,home_partner_id],NULL))))`,
      [job.match_id, job.recipient_id, job.source_event_id ?? job.event_id],
    );
    return rows.length > 0;
  }
  async flush(limit = 2) {
    limit = Math.max(1, Math.min(20, Math.trunc(limit)));
    if (!this.enabled) return { sent: 0, failed: 0, skipped: 0 };
    // Resend's deduplication lasts 24h. Stop retries before that window expires.
    await this.pool.query(
      `UPDATE public.result_email_outbox SET status='failed' WHERE status IN ('pending','sending') AND (lease_until IS NULL OR lease_until<now()) AND (attempts>=5 OR created_at<now()-interval '23 hours')`,
    );
    const lease = randomUUID();
    const { rows: jobs } = await this.pool.query<ResultEmailJob>(
      `UPDATE public.result_email_outbox q SET status='sending',attempts=q.attempts+1,lease_id=$1,lease_until=now()+interval '2 minutes'
      FROM (SELECT id FROM public.result_email_outbox WHERE attempts<5 AND created_at>=now()-interval '23 hours' AND ((status='pending' AND next_attempt_at<=now()) OR (status='sending' AND lease_until<now())) ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED) picked
      WHERE q.id=picked.id RETURNING q.*`,
      [lease, limit],
    );
    const totals = { sent: 0, failed: 0, skipped: 0 };
    const started = Date.now();
    for (const job of jobs) {
      if (Date.now() - started > 18000) break;
      let outcome: 'sent' | 'skipped' | 'pending' | 'failed' = 'skipped';
      try {
        const profile = (
          await this.pool.query(
            'SELECT auth_user_id,role FROM public.profiles WHERE id=$1 AND active',
            [job.recipient_id],
          )
        ).rows[0];
        if (profile?.auth_user_id && (await this.stillReviewable(job, profile.role))) {
          const { data, error } = await this.auth.auth.admin.getUserById(profile.auth_user_id);
          if (error) throw new Error('Recipient lookup failed.');
          const user = data.user;
          if (
            user?.email &&
            user.email_confirmed_at &&
            user.invited_at &&
            allowedEmail(user.email, this.domains)
          ) {
            await this.delivery.send({
              recipient: user.email,
              subject: job.subject,
              text: job.body,
              html: job.html ?? undefined,
              idempotencyKey: `vpl-${job.purpose === 'review' || !job.purpose ? 'result' : job.purpose}/${job.event_id}/${job.recipient_id}`,
            });
            outcome = 'sent';
          }
        }
      } catch {
        outcome = job.attempts >= 5 ? 'failed' : 'pending';
      }
      await this.pool.query(
        `UPDATE public.result_email_outbox SET status=$3,lease_id=NULL,lease_until=NULL,sent_at=CASE WHEN $3='sent' THEN now() ELSE NULL END,next_attempt_at=now()+($4::int*interval '1 minute') WHERE id=$1 AND lease_id=$2`,
        [job.id, lease, outcome, 2 ** job.attempts],
      );
      if (outcome === 'sent') totals.sent++;
      else if (outcome === 'skipped') totals.skipped++;
      else totals.failed++;
    }
    // Return unattempted leased jobs to the queue if the HTTP runtime budget is exhausted.
    await this.pool.query(
      "UPDATE public.result_email_outbox SET status='pending',attempts=attempts-1,lease_id=NULL,lease_until=NULL WHERE lease_id=$1",
      [lease],
    );
    return totals;
  }
}
