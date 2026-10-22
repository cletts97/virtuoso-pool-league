import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createClient, type User } from '@supabase/supabase-js';
import { createPool } from '../src/database';
import { readConfig } from '../src/config';
import { LeagueService } from '../src/service';
import { createHandler } from '../src/http';
import type { ApiCommand } from '../src/validation';
import { availableSlots, londonDate } from '../../src/domain/bookings';
import { addDays, standings } from '../../src/domain/rules';

describe.skipIf(process.env.RUN_DB_TESTS !== 'true')(
  'disposable LOCAL Supabase integration',
  () => {
    const config = readConfig({
      DATABASE_URL: 'postgresql://localhost/postgres',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'not-configured',
      APP_URL: 'http://127.0.0.1:5173',
      ...process.env,
    });
    if (!['127.0.0.1', 'localhost'].includes(new URL(config.databaseUrl).hostname))
      throw new Error('Integration tests refuse non-local databases.');
    const pool = createPool(config),
      auth = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const service = new LeagueService(pool, auth, config.emailDomains),
      handler = createHandler(service, auth, config);
    const users: User[] = [],
      tokens: string[] = [],
      profiles: string[] = [];
    let seasonId = '';
    const prefix = `Integration ${Date.now()}`;
    async function command(cmd: ApiCommand, actor = users[0]) {
      const state = await service.load(actor);
      return service.execute(actor, cmd, state.revision!);
    }
    beforeAll(async () => {
      for (let i = 0; i < 5; i++) {
        const email = `vpl-test-${Date.now()}-${i}@virtuoso.tech`,
          password = `Test-only-${crypto.randomUUID()}`;
        const result = await auth.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { data: { name: `${prefix} ${i}`, role: 'admin' } },
        });
        if (result.error) throw result.error;
        users.push(result.data.user!);
        const login = createClient(config.supabaseUrl, process.env.SUPABASE_PUBLIC_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const accepted = await login.auth.verifyOtp({
          token_hash: result.data.properties.hashed_token,
          type: 'invite',
        });
        if (accepted.error) throw accepted.error;
        const setup = await login.auth.updateUser({ password });
        if (setup.error) throw setup.error;
        const signed = await login.auth.signInWithPassword({ email, password });
        if (signed.error) throw signed.error;
        tokens.push(signed.data.session!.access_token);
        profiles.push((await service.me(result.data.user!)).id);
      }
      await pool.query("UPDATE public.profiles SET role='admin' WHERE id=$1", [profiles[0]]);
    }, 60000);
    it('adds a late player atomically and rejects concurrent duplicate joins', async () => {
      const created = await command({
        type: 'createSeason',
        name: `${prefix} late entry`,
        startDate: londonDate(new Date()),
        roundsPerWeek: 2,
        participantIds: profiles.slice(0, 4),
      });
      const lateSeason = created.seasons.find((s) => s.name === `${prefix} late entry`)!;
      const published = await command({ type: 'generate', seasonId: lateSeason.id });
      const oldMatches = published.fixtures.filter((f) => f.seasonId === lateSeason.id);
      const lateCommand = {
        type: 'addSeasonPlayer' as const,
        seasonId: lateSeason.id,
        playerId: profiles[4],
        dueDate: addDays(londonDate(new Date()), 14),
      };
      await expect(command(lateCommand, users[1])).rejects.toThrow('Administrator');
      const revision = (await service.load(users[0])).revision!;
      const results = await Promise.allSettled([
        service.execute(users[0], lateCommand, revision),
        service.execute(users[0], lateCommand, revision),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const saved = await service.load(users[0]);
      const matches = saved.fixtures.filter((f) => f.seasonId === lateSeason.id);
      expect(matches).toHaveLength(10);
      expect(matches.filter((f) => oldMatches.some((old) => old.id === f.id))).toEqual(oldMatches);
      expect(matches.filter((f) => f.status === 'postponed')).toHaveLength(4);
      expect(saved.seasons.find((s) => s.id === lateSeason.id)!.participantIds).toHaveLength(5);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM public.season_participants WHERE season_id=$1',
            [lateSeason.id],
          )
        ).rows[0].count,
      ).toBe(5);
      await expect(command(lateCommand)).rejects.toThrow('already');
    });
    afterAll(async () => {
      // Preserve audit history; deactivate test identities and release test reservations.
      if (profiles.length)
        await pool.query(
          "UPDATE public.table_bookings SET status='cancelled' WHERE owner_id=ANY($1::uuid[]) AND status='reserved'",
          [profiles],
        );
      for (const user of users) await auth.auth.admin.deleteUser(user.id);
      await pool.end();
    }, 30000);
    it('validates real Auth tokens, ignores metadata roles, and rejects missing/forged tokens', async () => {
      expect((await service.identity(tokens[1])).id).toBe(users[1].id);
      expect((await service.me(users[1])).role).toBe('colleague');
      expect((await handler(new Request('http://localhost/api/state'))).status).toBe(401);
      expect(
        (
          await handler(
            new Request('http://localhost/api/state', {
              headers: { Authorization: 'Bearer forged' },
            }),
          )
        ).status,
      ).toBe(401);
    });
    it('enforces invitation domain/admin/delivery gates without sending email', async () => {
      const request = (token: string, email: string) =>
        new Request('http://localhost/api/admin/invitations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test', email }),
        });
      expect((await handler(request(tokens[1], 'test@virtuoso.tech'))).status).toBe(403);
      expect((await handler(request(tokens[0], 'test@evil.example'))).status).toBe(400);
      expect((await handler(request(tokens[0], 'test@virtuoso.tech'))).status).toBe(503);
    });
    it('any-domain access still requires an invitation and an active profile', async () => {
      const allDomains = new LeagueService(pool, auth, ['*']);
      const client = createClient(config.supabaseUrl, process.env.SUPABASE_PUBLIC_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const invitation = await auth.auth.admin.generateLink({
        type: 'invite',
        email: `vpl-personal-${Date.now()}@example.net`,
      });
      if (invitation.error) throw invitation.error;
      users.push(invitation.data.user);
      const accepted = await client.auth.verifyOtp({
        token_hash: invitation.data.properties.hashed_token,
        type: 'invite',
      });
      if (accepted.error) throw accepted.error;
      const token = accepted.data.session!.access_token;
      const user = await allDomains.identity(token);
      expect(user.id).toBe(invitation.data.user.id);
      await expect(service.identity(token)).rejects.toThrow('confirmed invited account');
      const profile = await allDomains.me(user);
      expect(profile.role).toBe('colleague');
      await pool.query('UPDATE public.profiles SET active=false WHERE id=$1', [profile.id]);
      await expect(allDomains.load(user)).rejects.toThrow('inactive');

      const email = `vpl-not-invited-${Date.now()}@example.net`;
      const password = `Local-only-${crypto.randomUUID()}`;
      const created = await auth.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      users.push(created.data.user);
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      await expect(allDomains.identity(login.data.session!.access_token)).rejects.toThrow(
        'confirmed invited account',
      );
    });
    it('rejects inactive accounts with still-valid tokens', async () => {
      await pool.query('UPDATE public.profiles SET active=false WHERE id=$1', [profiles[4]]);
      expect(
        (
          await handler(
            new Request('http://localhost/api/state', {
              headers: { Authorization: `Bearer ${tokens[4]}` },
            }),
          )
        ).status,
      ).toBe(403);
      await pool.query('UPDATE public.profiles SET active=true WHERE id=$1', [profiles[4]]);
    });
    it('enrols existing identities, creates a season and publishes a unique schedule transactionally', async () => {
      for (let i = 0; i < 4; i++) await command({ type: 'enrolPlayer', id: profiles[i] });
      const state = await service.load(users[0]);
      const entries = state.participants.filter((p) =>
        p.playerIds.some((id) => profiles.slice(0, 4).includes(id)),
      );
      let next = await command({
        type: 'createSeason',
        name: prefix,
        startDate: londonDate(),
        participantIds: entries.map((p) => p.id),
        roundsPerWeek: 2,
      });
      seasonId = next.selectedSeasonId;
      next = await command({ type: 'generate', seasonId });
      expect(next.fixtures.filter((f) => f.seasonId === seasonId)).toHaveLength(6);
      await expect(command({ type: 'generate', seasonId })).rejects.toThrow();
    });
    it('persists fixture adjustments, leave, notices and idempotent administrator reminders', async () => {
      let state = await service.load(users[0]);
      const fixture = state.fixtures.find((f) => f.seasonId === seasonId)!;
      await command({
        type: 'reschedule',
        fixtureId: fixture.id,
        dueDate: londonDate(),
        reason: 'Local test catch-up',
      });
      state = await command({
        type: 'postpone',
        fixtureId: fixture.id,
        dueDate: londonDate(),
        reason: 'Agreed catch-up',
      });
      expect(state.fixtures.find((f) => f.id === fixture.id)!.history.map((h) => h.action)).toEqual(
        ['rescheduled', 'postponed'],
      );
      await expect(service.reminders(users[1])).rejects.toThrow('Administrator');
      expect((await service.reminders(users[0])).created).toBeGreaterThan(0);
      expect((await service.reminders(users[0])).created).toBe(0);
      await command({ type: 'announce', seasonId, title: 'Local notice', body: 'Catch-up week' });
      state = await service.load(users[1]);
      const notice = state.notifications.find((n) => n.seasonId === seasonId)!;
      await command({ type: 'readNotifications', ids: [notice.id] }, users[1]);
      expect(
        (await service.load(users[1])).notifications.find((n) => n.id === notice.id)!.read,
      ).toBe(true);
      await command({
        type: 'availability',
        playerId: profiles[1],
        from: '2027-02-01',
        to: '2027-02-03',
        reason: 'Annual leave',
      });
      state = await service.load(users[0]);
      const leave = state.availability.find(
        (a) => a.playerId === profiles[1] && a.from === '2027-02-01',
      )!;
      await command({ type: 'removeAvailability', id: leave.id });
      expect((await service.load(users[0])).availability.some((a) => a.id === leave.id)).toBe(
        false,
      );
    });
    it('submits, rejects self/third-party approval, races two approvals, and appends exactly one approval event', async () => {
      let state = await service.load(users[0]);
      const f = state.fixtures.find((f) => f.seasonId === seasonId)!;
      const home = state.participants.find((p) => p.id === f.homeId)!.playerIds[0],
        away = state.participants.find((p) => p.id === f.awayId)!.playerIds[0];
      const homeUser = users[profiles.indexOf(home)],
        awayUser = users[profiles.indexOf(away)];
      state = await command(
        { type: 'submit', fixtureId: f.id, score: { home: 2, away: 1 } },
        homeUser,
      );
      expect(
        standings(
          state.seasons.find((s) => s.id === seasonId)!,
          state.fixtures,
        ).every((r) => r.played === 0),
      ).toBe(true);
      await expect(
        command({ type: 'review', fixtureId: f.id, approve: true, reason: '' }, homeUser),
      ).rejects.toThrow();
      await expect(
        command({ type: 'review', fixtureId: f.id, approve: true, reason: '' }, users[4]),
      ).rejects.toThrow();
      const revision = (await service.load(awayUser)).revision!;
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          service.execute(
            awayUser,
            { type: 'review', fixtureId: f.id, approve: true, reason: '' },
            revision,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const saved = (await service.load(users[0])).fixtures.find((x) => x.id === f.id)!;
      expect(saved.status).toBe('confirmed');
      expect(saved.history.map((h) => h.action)).toEqual([
        'rescheduled',
        'postponed',
        'submitted',
        'approved',
      ]);
    });
    it('disputes and admin corrections retain history and update derived standings', async () => {
      let state = await service.load(users[0]);
      const f = state.fixtures.find((f) => f.seasonId === seasonId && f.status === 'scheduled')!;
      const home =
          users[profiles.indexOf(state.participants.find((p) => p.id === f.homeId)!.playerIds[0])],
        away =
          users[profiles.indexOf(state.participants.find((p) => p.id === f.awayId)!.playerIds[0])];
      await command({ type: 'submit', fixtureId: f.id, score: { home: 2, away: 0 } }, home);
      await command(
        { type: 'review', fixtureId: f.id, approve: false, reason: 'Frame reversed' },
        away,
      );
      state = await command({
        type: 'correct',
        fixtureId: f.id,
        score: { home: 0, away: 2 },
        reason: 'Both players agreed',
      });
      expect(state.fixtures.find((x) => x.id === f.id)!.history.map((h) => h.action)).toEqual([
        'submitted',
        'disputed',
        'corrected',
      ]);
      const totals = await pool.query(
        'SELECT sum(won)::integer AS wins FROM public.regular_season_totals WHERE season_id=$1',
        [seasonId],
      );
      expect(totals.rows[0].wins).toBe(2);
    });
    it('serializes concurrent casual reservations and enforces owner/admin access', async () => {
      const state = await service.load(users[4]);
      let slot: string | undefined;
      for (let i = 0; i <= 7 && !slot; i++)
        slot = availableSlots(state, addDays(londonDate(), i), 30, new Date())[0];
      expect(slot).toBeTruthy();
      const booking = {
        kind: 'casual' as const,
        startAt: slot!,
        duration: 30 as const,
        guestIds: [],
      };
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          service.execute(users[4], { type: 'saveBooking', booking }, state.revision!),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const next = await service.load(users[4]);
      const b = next.bookings.find((b) => b.ownerId === profiles[4] && b.status === 'reserved')!;
      await expect(command({ type: 'cancelBooking', id: b.id }, users[1])).rejects.toThrow('owner');
      await command({ type: 'cancelBooking', id: b.id }, users[4]);
    });
    it('races two bookings for the same fixture at different times', async () => {
      const state = await service.load(users[0]);
      const f = state.fixtures.find((f) => f.seasonId === seasonId && f.status === 'scheduled')!;
      let slots: string[] = [];
      for (let i = 0; i <= 7 && slots.length < 3; i++)
        slots = availableSlots(state, addDays(londonDate(), i), 15, new Date());
      const results = await Promise.allSettled(
        [slots[0], slots[2]].map((startAt) =>
          service.execute(
            users[0],
            {
              type: 'saveBooking',
              booking: { kind: 'league', fixtureId: f.id, startAt, duration: 15, guestIds: [] },
            },
            state.revision!,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const b = (await service.load(users[0])).bookings.find((b) => b.fixtureId === f.id)!;
      await command({ type: 'cancelBooking', id: b.id });
    });
    it('keeps private data out of other accounts and out of the public HUD', async () => {
      await command({
        type: 'availability',
        playerId: profiles[1],
        from: '2027-01-01',
        to: '2027-01-02',
        reason: 'PRIVATE-REASON',
      });
      const regular = await service.load(users[2]);
      expect(regular.availability.some((a) => a.reason === 'PRIVATE-REASON')).toBe(false);
      expect(regular.notifications.every((n) => n.userId === profiles[2])).toBe(true);
      const display = await service.display();
      expect(JSON.stringify(display)).not.toContain('PRIVATE-REASON');
      expect(JSON.stringify(display)).not.toContain('auth_user_id');
    });
    it('rejects deleted Auth users even with a previously valid access token and preserves their profile', async () => {
      await auth.auth.admin.deleteUser(users[4].id);
      expect(
        (
          await handler(
            new Request('http://localhost/api/state', {
              headers: { Authorization: `Bearer ${tokens[4]}` },
            }),
          )
        ).status,
      ).toBe(401);
      const row = await pool.query('SELECT active,auth_user_id FROM public.profiles WHERE id=$1', [
        profiles[4],
      ]);
      expect(row.rows[0]).toEqual({ active: false, auth_user_id: null });
    });
    it('completes regular fixtures, automatically seeds playoffs, and advances to an approved champion', async () => {
      async function play(id: string) {
        const state = await service.load(users[0]),
          f = state.fixtures.find((f) => f.id === id)!;
        const home =
            users[
              profiles.indexOf(state.participants.find((p) => p.id === f.homeId)!.playerIds[0])
            ],
          away =
            users[
              profiles.indexOf(state.participants.find((p) => p.id === f.awayId)!.playerIds[0])
            ];
        await command(
          { type: 'submit', fixtureId: id, score: { home: Math.ceil(f.bestOf / 2), away: 0 } },
          home,
        );
        await command({ type: 'review', fixtureId: id, approve: true, reason: '' }, away);
      }
      let state = await service.load(users[0]);
      for (const f of state.fixtures.filter(
        (f) => f.seasonId === seasonId && f.status === 'scheduled',
      ))
        await play(f.id);
      state = await service.load(users[0]);
      expect(state.seasons.find((s) => s.id === seasonId)!.qualifiers).toHaveLength(4);
      const semis = state.fixtures.filter(
        (f) => f.seasonId === seasonId && f.stage === 'semifinal',
      );
      expect(semis).toHaveLength(2);
      expect(semis.every((f) => f.bestOf === 5)).toBe(true);
      expect(semis.map((f) => f.bracketSlot)).toEqual([1, 2]);
      for (const f of semis) await play(f.id);
      state = await service.load(users[0]);
      const final = state.fixtures.find((f) => f.seasonId === seasonId && f.stage === 'final')!;
      expect(final.bestOf).toBe(7);
      expect(final.homeId).toBe(semis[0].homeId);
      expect(final.awayId).toBe(semis[1].homeId);
      await play(final.id);
      state = await service.load(users[0]);
      expect(state.seasons.find((s) => s.id === seasonId)!.status).toBe('complete');
      expect(state.seasons.find((s) => s.id === seasonId)!.championId).toBe(final.homeId);
    });
    it('blocks public signup while invitation acceptance and password reset work with locally generated links', async () => {
      const email = `vpl-invite-${Date.now()}@virtuoso.tech`,
        password = `Local-only-${crypto.randomUUID()}`;
      const client = createClient(config.supabaseUrl, process.env.SUPABASE_PUBLIC_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect((await client.auth.signUp({ email, password })).error).not.toBeNull();
      const invitation = await auth.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { name: `${prefix} invited` } },
      });
      if (invitation.error) throw invitation.error;
      users.push(invitation.data.user);
      profiles.push(
        (
          await pool.query('SELECT id FROM public.profiles WHERE auth_user_id=$1', [
            invitation.data.user.id,
          ])
        ).rows[0].id,
      );
      const accepted = await client.auth.verifyOtp({
        token_hash: invitation.data.properties.hashed_token,
        type: 'invite',
      });
      if (accepted.error) throw accepted.error;
      expect((await client.auth.updateUser({ password })).error).toBeNull();
      await client.auth.signOut();
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      const recovery = await auth.auth.admin.generateLink({ type: 'recovery', email });
      if (recovery.error) throw recovery.error;
      expect(
        (
          await client.auth.verifyOtp({
            token_hash: recovery.data.properties.hashed_token,
            type: 'recovery',
          })
        ).error,
      ).toBeNull();
      expect((await client.auth.updateUser({ password: `${password}-reset` })).error).toBeNull();
      await client.auth.signOut();
      expect(
        (await client.auth.signInWithPassword({ email, password: `${password}-reset` })).error,
      ).toBeNull();
    });
  },
);
