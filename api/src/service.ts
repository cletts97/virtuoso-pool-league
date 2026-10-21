import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import type { LeagueState, Player } from '../../src/domain/types';
import { executeCommand } from '../../src/data/commands';
import { displaySnapshot } from '../../src/data/display';
import { dateOnly, isParticipant } from '../../src/domain/rules';
import { normalizeNewIds, persistChanges } from './persist';
import { privateSnapshot, readState } from './state';
import { ApiError, requireCondition } from './errors';
import type { ApiCommand } from './validation';
import { allowedEmail } from './access';
import { AvatarStorage } from './avatars';

export class LeagueService {
  constructor(
    private pool: Pool,
    private auth: SupabaseClient,
    private emailDomains: string[],
  ) {}
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
      const saved = await readState(client, actor.id);
      saved.selectedSeasonId = next.selectedSeasonId;
      return privateSnapshot(saved);
    }, true);
    return new AvatarStorage(this.auth).decorate(state);
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
        (f) => ['scheduled', 'postponed'].includes(f.status) && f.dueDate <= today,
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
            title: f.dueDate < today ? 'A fixture needs a catch-up' : 'Your fixture is due today',
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
