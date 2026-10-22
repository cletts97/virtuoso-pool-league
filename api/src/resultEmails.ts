import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueState } from '../../src/domain/types';
import { canApprove, participantName } from '../../src/domain/rules';
import { canReviewCasual } from '../../src/domain/casual';
import { allowedEmail } from './access';
import type { EmailDelivery } from './email';

export interface ResultEmailJob {
  id: string;
  event_id: string;
  recipient_id: string;
  match_kind: 'league' | 'casual';
  match_id: string;
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
          subject: 'Please review a pool match result',
          body: `A ${kind} result needs your confirmation.\n\n${home} ${homeScore} – ${awayScore} ${away}\n\nThis score is pending. Sign in to review it, then confirm or dispute it:\n${url}\n\nOnly confirmed results count towards records. This link does not approve the result or bypass sign-in.`,
        });
  };
  for (const f of next.fixtures) {
    const event = f.history.at(-1);
    if (
      f.status !== 'pending' ||
      !f.score ||
      event?.action !== 'submitted' ||
      before.fixtures.find((old) => old.id === f.id)?.history.some((h) => h.id === event.id)
    )
      continue;
    add(
      event.id,
      next.players.filter((p) => canApprove(f, p.id, next.participants)).map((p) => p.id),
      'league',
      f.id,
      participantName(next, f.homeId),
      participantName(next, f.awayId),
      f.score.home,
      f.score.away,
    );
  }
  for (const r of next.casualResults ?? []) {
    const event = r.history.at(-1);
    if (
      r.status !== 'pending' ||
      event?.action !== 'submitted' ||
      before.casualResults?.find((old) => old.id === r.id)?.history.some((h) => h.id === event.id)
    )
      continue;
    const name = (ids: string[]) =>
      ids.map((id) => next.players.find((p) => p.id === id)?.name ?? 'Colleague').join(' & ');
    add(
      event.id,
      next.players.filter((p) => canReviewCasual(r, p.id)).map((p) => p.id),
      'casual',
      r.id,
      name(r.homePlayerIds),
      name(r.awayPlayerIds),
      r.score.home,
      r.score.away,
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
  ) {}
  async enqueue(client: PoolClient, before: LeagueState, next: LeagueState) {
    if (!this.enabled) return;
    for (const i of reviewEmailIntents(before, next, this.appUrl))
      await client.query(
        `INSERT INTO public.result_email_outbox(event_id,recipient_id,match_kind,match_id,subject,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id,recipient_id) DO NOTHING`,
        [i.eventId, i.recipientId, i.kind, i.matchId, i.subject, i.body],
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
  private async stillReviewable(job: ResultEmailJob) {
    if (job.match_kind === 'league') {
      const { rows } = await this.pool.query(
        `SELECT 1 FROM public.fixtures f
        JOIN public.participant_members mine ON mine.participant_id IN (f.home_id,f.away_id) AND mine.profile_id=$2
        JOIN public.participant_members sender ON sender.participant_id IN (f.home_id,f.away_id) AND sender.profile_id=f.submitted_by
        WHERE f.id=$1 AND f.status='pending' AND mine.participant_id<>sender.participant_id
        AND (SELECT e.id FROM public.result_events e WHERE fixture_id=f.id ORDER BY fixture_revision DESC LIMIT 1)=$3`,
        [job.match_id, job.recipient_id, job.event_id],
      );
      return rows.length > 0;
    }
    const { rows } = await this.pool.query(
      `SELECT 1 FROM public.casual_results WHERE id=$1 AND status='pending'
      AND (history->-1->>'id')=$3 AND
      (($2=ANY(array_remove(ARRAY[home_player_id,home_partner_id],NULL)) AND submitted_by=ANY(array_remove(ARRAY[away_player_id,away_partner_id],NULL))) OR
       ($2=ANY(array_remove(ARRAY[away_player_id,away_partner_id],NULL)) AND submitted_by=ANY(array_remove(ARRAY[home_player_id,home_partner_id],NULL))))`,
      [job.match_id, job.recipient_id, job.event_id],
    );
    return rows.length > 0;
  }
  async flush() {
    if (!this.enabled) return { sent: 0, failed: 0, skipped: 0 };
    // Resend's deduplication lasts 24h. Stop retries before that window expires.
    await this.pool.query(
      `UPDATE public.result_email_outbox SET status='failed' WHERE status IN ('pending','sending') AND (lease_until IS NULL OR lease_until<now()) AND (attempts>=5 OR created_at<now()-interval '23 hours')`,
    );
    const lease = randomUUID();
    const { rows: jobs } = await this.pool.query<ResultEmailJob>(
      `UPDATE public.result_email_outbox q SET status='sending',attempts=q.attempts+1,lease_id=$1,lease_until=now()+interval '2 minutes'
      FROM (SELECT id FROM public.result_email_outbox WHERE attempts<5 AND created_at>=now()-interval '23 hours' AND ((status='pending' AND next_attempt_at<=now()) OR (status='sending' AND lease_until<now())) ORDER BY created_at LIMIT 2 FOR UPDATE SKIP LOCKED) picked
      WHERE q.id=picked.id RETURNING q.*`,
      [lease],
    );
    const totals = { sent: 0, failed: 0, skipped: 0 };
    for (const job of jobs) {
      let outcome: 'sent' | 'skipped' | 'pending' | 'failed' = 'skipped';
      try {
        const profile = (
          await this.pool.query('SELECT auth_user_id FROM public.profiles WHERE id=$1 AND active', [
            job.recipient_id,
          ])
        ).rows[0];
        if (profile?.auth_user_id && (await this.stillReviewable(job))) {
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
              idempotencyKey: `vpl-result/${job.event_id}/${job.recipient_id}`,
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
    return totals;
  }
}
