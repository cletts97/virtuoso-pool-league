import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import type { LeagueState, Player } from '../../src/domain/types';
import { executeCommand } from '../../src/data/commands';
import { displaySnapshot } from '../../src/data/display';
import { dateOnly, isParticipant, weekStart, weekEnd } from '../../src/domain/rules';
import { normalizeNewIds, persistChanges } from './persist';
import { privateSnapshot, readState } from './state';
import { ApiError, requireCondition } from './errors';
import type { ApiCommand } from './validation';
import { allowedEmail } from './access';
import { AvatarStorage } from './avatars';
import { publicSnapshot } from '../../src/data/publicSnapshot';
import { automaticallyConfirmResults } from '../../src/data/automaticResults';
import {
  mondayNewsletterWindow,
  newsletterEmailIntents,
  reminderEmailIntents,
} from './scheduledEmails';
import type { ResultEmailQueue } from './resultEmails';

export class LeagueService {
  constructor(
    private pool: Pool,
    private auth: SupabaseClient,
    private emailDomains: string[],
    private resultEmails?: ResultEmailQueue,
    private automationAppUrl?: string,
  ) {}
  async runAutomation(task: 'results' | 'weekly', now = new Date()) {
    requireCondition(this.resultEmails?.enabled, 503, 'Scheduled email delivery is disabled.');
    const appUrl = this.automationAppUrl;
    requireCondition(appUrl, 503, 'The automation app URL is not configured.');
    if (task === 'weekly' && !mondayNewsletterWindow(now))
      return { skipped: true, confirmed: 0, eligibleEmails: 0 };
    const result = await this.transaction(async (client) => {
      // Same advisory lock as player/admin mutations: a dispute and timeout cannot race.
      const before = await readState(client);
      const next =
        task === 'results' ? automaticallyConfirmResults(before, now) : structuredClone(before);
      const intents =
        task === 'weekly'
          ? newsletterEmailIntents(next, now, appUrl)
          : reminderEmailIntents(next, now, appUrl);
      normalizeNewIds(before, next);
      await persistChanges(client, before, next);
      await this.resultEmails!.enqueueScheduled(client, intents);
      const confirmed =
        next.fixtures.filter(
          (f) =>
            f.history.at(-1)?.action === 'auto_approved' &&
            before.fixtures.find((old) => old.id === f.id)?.status === 'pending',
        ).length +
        (next.casualResults ?? []).filter(
          (r) =>
            r.history.at(-1)?.action === 'auto_approved' &&
            before.casualResults?.find((old) => old.id === r.id)?.status === 'pending',
        ).length;
      return { confirmed, eligibleEmails: intents.length };
    }, true);
    // Failure here must not roll back saved confirmations or queued messages.
    try {
      return { ...result, delivery: await this.resultEmails.flush(20) };
    } catch {
      return { ...result, deliveryDeferred: true };
    }
  }
  async identity(token: string): Promise<User> {
    const { data, error } = await this.auth.auth.getUser(token);
    requireCondition(
      !error &&
        data.user &&
        data.user.email_confirmed_at &&
        data.user.invited_at &&
        allowedEmail(data.user.email ?? '', this.emailDomains),
      401,
      'Sign in with a confirmed invited account.',
    );
    return data.user;
  }
  private async actor(client: PoolClient, user: User): Promise<Player> {
    const { rows } = await client.query<Player>(
      'SELECT id,name,department,role,active,color FROM public.profiles WHERE auth_user_id=$1 AND active FOR SHARE',
      [user.id],
    );
    requireCondition(rows[0], 403, 'Your account is inactive or no longer has access.');
    return rows[0];
  }
  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
    write = false,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query('SET LOCAL ROLE service_role');
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      // One office league: serializing short writes is simpler than a graph of per-season locks.
      if (write) await client.query('SELECT pg_advisory_xact_lock(872341001)');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async me(user: User) {
    return this.transaction((client) => this.actor(client, user));
  }
  async load(user: User) {
    const state = await this.transaction(async (client) => {
      const actor = await this.actor(client, user);
      return privateSnapshot(await readState(client, actor.id));
    });
    return new AvatarStorage(this.auth).decorate(state);
  }
  async saveAvatar(user: User, image: string | null) {
    const actor = await this.me(user);
    await new AvatarStorage(this.auth).save(actor.id, image);
    return this.load(user);
  }
  async display() {
    return this.transaction(async (client) => displaySnapshot(await readState(client)));
  }
  async publicState() {
    return this.transaction(async (client) => publicSnapshot(await readState(client)));
  }
  async execute(user: User, command: ApiCommand, expectedRevision: string) {
    const state = await this.transaction(async (client) => {
      const actor = await this.actor(client, user);
      // All APIs use the advisory lock; row locks also coordinate with database maintenance.
      if ('fixtureId' in command)
        await client.query('SELECT id FROM public.fixtures WHERE id=$1 FOR UPDATE', [
          command.fixtureId,
        ]);
      if (command.type === 'saveBooking' && command.booking.fixtureId)
        await client.query('SELECT id FROM public.fixtures WHERE id=$1 FOR UPDATE', [
          command.booking.fixtureId,
        ]);
      const before = await readState(client, actor.id);
      requireCondition(
        before.revision === expectedRevision,
        409,
        'The league has changed since you loaded it. Refresh and review the latest information before saving again.',
      );
      let next: LeagueState;
      const playerActions = [
        'submitCasual',
        'reviewCasual',
        'updateProfile',
        'submit',
        'review',
        'postpone',
        'saveBooking',
        'cancelBooking',
        'readNotifications',
      ];
      requireCondition(
        actor.role === 'admin' || playerActions.includes(command.type),
        403,
        'Administrator access required.',
      );
      if (command.type === 'submit' || command.type === 'review' || command.type === 'postpone') {
        const f = before.fixtures.find((f) => f.id === command.fixtureId);
        requireCondition(
          f &&
            ((actor.role === 'admin' && command.type === 'postpone') ||
              isParticipant(f, actor.id, before.participants)),
          403,
          'Only a match participant can perform this action.',
        );
      }
      if ((command.type === 'saveBooking' && command.id) || command.type === 'cancelBooking') {
        const id = 'id' in command ? command.id : undefined;
        const b = before.bookings.find((b) => b.id === id);
        requireCondition(
          b && (b.ownerId === actor.id || actor.role === 'admin'),
          403,
          'Only the owner or an administrator can manage this booking.',
        );
      }
      if (command.type === 'generate') {
        const season = before.seasons.find((s) => s.id === command.seasonId);
        const members = before.participants
          .filter((p) => season?.participantIds.includes(p.id))
          .flatMap((p) => p.playerIds);
        requireCondition(
          season?.format === 'singles' &&
            members.length === season.participantIds.length &&
            new Set(members).size === members.length,
          400,
          'Each singles entry must represent one distinct player.',
        );
      }
      try {
        next = executeCommand(before, command);
      } catch (e) {
        throw new ApiError(400, e instanceof Error ? e.message : 'Invalid command.');
      }
      normalizeNewIds(before, next);
      await persistChanges(client, before, next);
      await this.resultEmails?.enqueue(client, before, next);
      const saved = await readState(client, actor.id);
      saved.selectedSeasonId = next.selectedSeasonId;
      return privateSnapshot(saved);
    }, true);
    // Scores are already committed. Provider failure must never turn a saved score into an error.
    if (this.resultEmails?.enabled)
      try {
        await this.resultEmails.flush();
      } catch {
        console.warn('Result email delivery deferred; check the administrator email queue.');
      }
    return new AvatarStorage(this.auth).decorate(state);
  }
  async resultEmailStatus(user: User, send = false) {
    const actor = await this.me(user);
    requireCondition(actor.role === 'admin', 403, 'Administrator access required.');
    if (!this.resultEmails) return { enabled: false, ready: false, pending: 0, failed: 0, sent: 0 };
    const status = await this.resultEmails.status();
    if (send) {
      requireCondition(
        status.enabled && status.ready,
        400,
        'Configure result email delivery and apply its migration first.',
      );
      await this.resultEmails.flush();
      return this.resultEmails.status();
    }
    return status;
  }
  async reminders(user: User) {
    return this.transaction(async (client) => {
      const actor = await this.actor(client, user);
      requireCondition(actor.role === 'admin', 403, 'Administrator access required.');
      const state = await readState(client, actor.id),
        next = structuredClone(state),
        today = dateOnly();
      let count = 0;
      for (const f of state.fixtures.filter(
        (f) =>
          ['scheduled', 'postponed'].includes(f.status) && weekStart(f.dueDate) <= weekStart(today),
      )) {
        const season = state.seasons.find((s) => s.id === f.seasonId);
        if (
          !season ||
          season.status === 'complete' ||
          (season.status === 'playoffs' && f.stage === 'regular')
        )
          continue;
        for (const p of state.players.filter(
          (p) => p.active && isParticipant(f, p.id, state.participants),
        )) {
          const hex = createHash('sha256')
            .update(`reminder:${today}:${f.id}:${p.id}`)
            .digest('hex')
            .slice(0, 32);
          const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
          if (state.notifications.some((n) => n.id === id)) continue;
          next.notifications.push({
            id,
            userId: p.id,
            seasonId: f.seasonId,
            fixtureId: f.id,
            kind: 'upcoming',
            title:
              weekEnd(f.dueDate) < today
                ? 'A fixture needs a catch-up'
                : 'Your fixture is scheduled this week',
            body: 'Arrange your match with your opponent. No automatic loss is applied.',
            createdAt: new Date().toISOString(),
            read: false,
          });
          count++;
        }
      }
      await persistChanges(client, state, next);
      return { created: count };
    }, true);
  }
}
