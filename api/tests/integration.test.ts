import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createClient, type User } from '@supabase/supabase-js';
import { createPool } from '../src/database';
import { readConfig } from '../src/config';
import { LeagueService } from '../src/service';
import { createHandler } from '../src/http';
import type { ApiCommand } from '../src/validation';
import { availableSlots, londonDate, londonToUtc } from '../../src/domain/bookings';
import { mondayOfWeek } from '../src/scheduledEmails';
import { addDays, standings } from '../../src/domain/rules';
import { ResultEmailQueue } from '../src/resultEmails';
import type { EmailMessage } from '../src/email';

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
    it('runs scheduled newsletters, reminders and automatic confirmations idempotently', async () => {
      const sent: EmailMessage[] = [];
      const queue = new ResultEmailQueue(
        pool,
        auth,
        {
          send: async (m) => {
            sent.push(m);
          },
        },
        true,
        config.appUrl,
        config.emailDomains,
      );
      const scheduler = new LeagueService(pool, auth, config.emailDomains, queue, config.appUrl);
      const monday = mondayOfWeek(new Date());
      let state = await command({
        type: 'createSeason',
        name: `${prefix} scheduled`,
        startDate: monday,
        participantIds: profiles.slice(0, 4),
        roundsPerWeek: 2,
      });
      const season = state.selectedSeasonId;
      state = await command({ type: 'generate', seasonId: season });
      const weeklyAt = new Date(londonToUtc(monday, '07:00'));
      await Promise.all([
        scheduler.runAutomation('weekly', weeklyAt),
        scheduler.runAutomation('weekly', weeklyAt),
      ]);
      for (let attempt = 0; attempt < 5; attempt++) await queue.flush(20);
      const newsletters = await pool.query(
        "SELECT recipient_id,status,html FROM public.result_email_outbox WHERE purpose='newsletter' AND recipient_id=ANY($1::uuid[])",
        [profiles],
      );
      expect(newsletters.rows).toHaveLength(5);
      expect(
        newsletters.rows.every((r) => r.status === 'sent' && r.html.includes('Virtuoso')),
      ).toBe(true);
      expect(sent.filter((m) => m.subject.includes('Fixtures for week'))).toHaveLength(5);

      // Seed original past submissions, never edit immutable audit events.
      const at = new Date(),
        old = new Date(at.getTime() - 49 * 3_600_000).toISOString();
      for (const f of state.fixtures.filter((f) => f.seasonId === season)) {
        const owner = state.participants.find((p) => p.id === f.homeId)!.playerIds[0];
        const row = await pool.query(
          "UPDATE public.fixtures SET status='pending',home_score=2,away_score=0,submitted_by=$2 WHERE id=$1 RETURNING revision",
          [f.id, owner],
        );
        await pool.query(
          "INSERT INTO public.result_events(fixture_id,fixture_revision,action,actor_id,home_score,away_score,occurred_at) VALUES($1,$2,'submitted',$3,2,0,$4)",
          [f.id, row.rows[0].revision, owner, old],
        );
      }
      const casualId = crypto.randomUUID(),
        disputedId = crypto.randomUUID();
      const submission = {
        id: crypto.randomUUID(),
        action: 'submitted',
        actorId: profiles[0],
        at: new Date(at.getTime() - 25 * 3_600_000).toISOString(),
        score: { home: 2, away: 1 },
      };
      const insertCasual = (id: string, status: string, history: unknown[]) =>
        pool.query(
          'INSERT INTO public.casual_results(id,home_player_id,home_partner_id,away_player_id,away_partner_id,played_on,best_of,home_score,away_score,status,submitted_by,history) VALUES($1,$2,$3,$4,$5,current_date,3,2,1,$6,$2,$7)',
          [id, profiles[0], profiles[1], profiles[2], profiles[3], status, JSON.stringify(history)],
        );
      await insertCasual(casualId, 'pending', [submission]);
      // The original review and the later reminder must coexist under the
      // original two-column unique constraint (backwards-compatible migration).
      await pool.query(
        "INSERT INTO public.result_email_outbox(event_id,recipient_id,match_kind,match_id,subject,body) VALUES($1,$2,'casual',$3,'Initial review','Review the score')",
        [submission.id, profiles[2], casualId],
      );
      await insertCasual(disputedId, 'disputed', [
        { ...submission, at: old },
        { ...submission, id: crypto.randomUUID(), action: 'disputed', actorId: profiles[2] },
      ]);
      await Promise.all([
        scheduler.runAutomation('results', at),
        scheduler.runAutomation('results', at),
      ]);
      state = await service.load(users[0]);
      const league = state.fixtures.filter((f) => f.seasonId === season && f.stage === 'regular');
      expect(
        league.every(
          (f) =>
            f.status === 'confirmed' &&
            f.history.at(-1)?.action === 'auto_approved' &&
            f.history.at(-1)?.actorId === null,
        ),
      ).toBe(true);
      expect(state.seasons.find((s) => s.id === season)!.qualifiers).toHaveLength(4);
      expect(
        state.fixtures.filter((f) => f.seasonId === season && f.stage === 'semifinal'),
      ).toHaveLength(2);
      const metadata = await pool.query(
        "SELECT confirmation_kind,confirmed_by FROM public.fixtures WHERE season_id=$1 AND stage='regular'",
        [season],
      );
      expect(
        metadata.rows.every((r) => r.confirmation_kind === 'automatic' && r.confirmed_by === null),
      ).toBe(true);
      const reminders = await pool.query(
        "SELECT recipient_id FROM public.result_email_outbox WHERE purpose='reminder' AND match_id=$1",
        [casualId],
      );
      expect(reminders.rows.map((r) => r.recipient_id).sort()).toEqual(
        [profiles[2], profiles[3]].sort(),
      );
      expect(state.casualResults!.find((r) => r.id === disputedId)!.status).toBe('disputed');
      expect(state.casualResults!.find((r) => r.id === casualId)!.status).toBe('pending');
      await scheduler.runAutomation('results', new Date(at.getTime() + 24 * 3_600_000));
      state = await service.load(users[0]);
      expect(state.casualResults!.find((r) => r.id === casualId)!.history.at(-1)).toMatchObject({
        action: 'auto_approved',
        actorId: null,
      });
      expect(state.casualResults!.find((r) => r.id === disputedId)!.status).toBe('disputed');
      const jobCounts = await pool.query(
        "SELECT count(*)::int AS n FROM public.result_email_outbox WHERE purpose='reminder' AND match_id=$1",
        [casualId],
      );
      expect(jobCounts.rows[0].n).toBe(2);
      const raceId = crypto.randomUUID();
      await insertCasual(raceId, 'pending', [{ ...submission, id: crypto.randomUUID(), at: old }]);
      const revision = (await service.load(users[2])).revision!;
      await Promise.allSettled([
        service.execute(
          users[2],
          { type: 'reviewCasual', id: raceId, approve: false, reason: 'Racing dispute' },
          revision,
        ),
        scheduler.runAutomation('results', at),
      ]);
      const raced = (await service.load(users[0])).casualResults!.find((r) => r.id === raceId)!;
      expect(raced.history).toHaveLength(2);
      expect(['disputed', 'auto_approved']).toContain(raced.history.at(-1)!.action);
      expect(raced.status).toBe(
        raced.history.at(-1)!.action === 'disputed' ? 'disputed' : 'confirmed',
      );
      const clientAccess = await pool.query(
        "SELECT has_table_privilege('authenticated','public.result_email_outbox','SELECT') AS allowed",
      );
      expect(clientAccess.rows[0].allowed).toBe(false);
    }, 60000);
    it('emails current administrators about new disputes and skips demoted or resolved recipients', async () => {
      const delivered: EmailMessage[] = [];
      let unavailable = true;
      const queue = new ResultEmailQueue(
        pool,
        auth,
        {
          send: async (m) => {
            if (unavailable) throw new Error('Fake outage');
            delivered.push(m);
          },
        },
        true,
        config.appUrl,
        config.emailDomains,
      );
      const enabled = new LeagueService(pool, auth, config.emailDomains, queue);
      await pool.query("UPDATE public.profiles SET role='admin' WHERE id=$1", [profiles[3]]);
      const id = crypto.randomUUID();
      await command(
        {
          type: 'submitCasual',
          result: {
            id,
            homePlayerIds: [profiles[1]],
            awayPlayerIds: [profiles[2]],
            playedOn: '2026-01-01',
            bestOf: 3,
            score: { home: 2, away: 1 },
          },
        },
        users[1],
      );
      let state = await service.load(users[2]);
      await enabled.execute(
        users[2],
        { type: 'reviewCasual', id, approve: false, reason: 'Private correction reason' },
        state.revision!,
      );
      expect(
        (
          await pool.query(
            'SELECT recipient_id FROM public.result_email_outbox WHERE match_id=$1 ORDER BY recipient_id',
            [id],
          )
        ).rows.map((r) => r.recipient_id),
      ).toEqual([profiles[0], profiles[3]].sort());
      await pool.query("UPDATE public.profiles SET role='colleague' WHERE id=$1", [profiles[3]]);
      await pool.query(
        'UPDATE public.result_email_outbox SET next_attempt_at=now() WHERE match_id=$1',
        [id],
      );
      unavailable = false;
      expect(await queue.flush()).toEqual({ sent: 1, failed: 0, skipped: 1 });
      expect(delivered).toHaveLength(1);
      expect(delivered[0].subject).toContain('disputed');
      expect(delivered[0].text).not.toContain('Private correction reason');
      await queue.flush();
      expect(delivered).toHaveLength(1);

      state = await command({
        type: 'createSeason',
        name: `${prefix} disputed email`,
        startDate: londonDate(new Date()),
        participantIds: profiles.slice(0, 4),
        roundsPerWeek: 2,
      });
      const season = state.selectedSeasonId;
      state = await command({ type: 'generate', seasonId: season });
      const fixture = state.fixtures.find((f) => f.seasonId === season)!;
      const home = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
      const away = state.participants.find((p) => p.id === fixture.awayId)!.playerIds[0];
      await command(
        { type: 'submit', fixtureId: fixture.id, score: { home: 2, away: 0 } },
        users[profiles.indexOf(home)],
      );
      state = await service.load(users[profiles.indexOf(away)]);
      await enabled.execute(
        users[profiles.indexOf(away)],
        { type: 'review', fixtureId: fixture.id, approve: false, reason: 'Needs checking' },
        state.revision!,
      );
      expect(delivered).toHaveLength(2);
      expect(delivered[1].text).toContain('/fixtures/' + fixture.id);

      // A dispute resolved during a delivery outage must not later send a stale alert.
      unavailable = true;
      const secondId = crypto.randomUUID();
      await command(
        {
          type: 'submitCasual',
          result: {
            id: secondId,
            homePlayerIds: [profiles[1]],
            awayPlayerIds: [profiles[2]],
            playedOn: '2026-01-01',
            bestOf: 3,
            score: { home: 2, away: 0 },
          },
        },
        users[1],
      );
      state = await service.load(users[2]);
      await enabled.execute(
        users[2],
        { type: 'reviewCasual', id: secondId, approve: false, reason: 'Check it' },
        state.revision!,
      );
      await command({
        type: 'resolveCasual',
        id: secondId,
        score: { home: 2, away: 0 },
        reason: 'Confirmed with players',
      });
      await pool.query(
        'UPDATE public.result_email_outbox SET next_attempt_at=now() WHERE match_id=$1',
        [secondId],
      );
      unavailable = false;
      expect((await queue.flush()).skipped).toBe(1);
      expect(delivered).toHaveLength(2);
    });
    it('durably retries score emails without rolling back submissions or sending stale duplicates', async () => {
      const accepted: EmailMessage[] = [];
      let fail = true;
      const queue = new ResultEmailQueue(
        pool,
        auth,
        {
          send: async (message) => {
            if (fail) throw new Error('Fake provider outage');
            accepted.push(message);
          },
        },
        true,
        config.appUrl,
        config.emailDomains,
      );
      const enabledService = new LeagueService(pool, auth, config.emailDomains, queue);
      const resultId = crypto.randomUUID();
      const result = {
        id: resultId,
        homePlayerIds: [profiles[1], profiles[3]],
        awayPlayerIds: [profiles[2], profiles[4]],
        playedOn: '2026-01-01',
        bestOf: 3 as const,
        score: { home: 2, away: 1 },
      };
      let state = await service.load(users[1]);
      await enabledService.execute(users[1], { type: 'submitCasual', result }, state.revision!);
      expect(
        (await service.load(users[1])).casualResults!.find((r) => r.id === resultId)!.status,
      ).toBe('pending');
      expect((await queue.status()).pending).toBe(2);
      fail = false;
      await pool.query(
        'UPDATE public.result_email_outbox SET next_attempt_at=now() WHERE match_id=$1',
        [resultId],
      );
      const retried = await Promise.all([queue.flush(), queue.flush()]);
      expect(retried.reduce((n, r) => n + r.sent, 0)).toBe(2);
      expect(accepted).toHaveLength(2);
      expect(new Set(accepted.map((m) => m.idempotencyKey)).size).toBe(2);
      await queue.flush();
      expect(accepted).toHaveLength(2);
      const staleId = crypto.randomUUID();
      fail = true;
      state = await service.load(users[1]);
      await enabledService.execute(
        users[1],
        { type: 'submitCasual', result: { ...result, id: staleId } },
        state.revision!,
      );
      await command({ type: 'reviewCasual', id: staleId, approve: true, reason: '' }, users[2]);
      fail = false;
      await pool.query(
        'UPDATE public.result_email_outbox SET next_attempt_at=now() WHERE match_id=$1',
        [staleId],
      );
      expect((await queue.flush()).skipped).toBe(2);
      expect(accepted).toHaveLength(2);
      await expect(enabledService.resultEmailStatus(users[1], true)).rejects.toThrow(
        'Administrator',
      );
      const grants = await pool.query(
        "SELECT has_table_privilege('anon','public.result_email_outbox','SELECT') AS anon,has_table_privilege('authenticated','public.result_email_outbox','INSERT') AS client",
      );
      expect(grants.rows[0]).toEqual({ anon: false, client: false });
    });
    it('manages draft enrollment, deletion and early ending without changing the schema', async () => {
      let state = await command({
        type: 'createSeason',
        name: `${prefix} disposable`,
        startDate: londonDate(new Date()),
        participantIds: profiles.slice(0, 4),
        roundsPerWeek: 2,
      });
      const disposable = state.selectedSeasonId;
      state = await command({
        type: 'addSeasonPlayer',
        seasonId: disposable,
        playerId: profiles[4],
        dueDate: addDays(londonDate(new Date()), 14),
      });
      expect(state.seasons.find((s) => s.id === disposable)!.participantIds).toHaveLength(5);
      await command({ type: 'generate', seasonId: disposable });
      await expect(
        command(
          { type: 'deleteSeason', seasonId: disposable, confirmName: `${prefix} disposable` },
          users[1],
        ),
      ).rejects.toThrow('Administrator');
      state = await command({
        type: 'deleteSeason',
        seasonId: disposable,
        confirmName: `${prefix} disposable`,
      });
      expect(state.seasons.some((s) => s.id === disposable)).toBe(false);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS total FROM public.fixtures WHERE season_id=$1',
            [disposable],
          )
        ).rows[0].total,
      ).toBe(0);
      state = await command({
        type: 'createSeason',
        name: `${prefix} ended`,
        startDate: londonDate(new Date()),
        participantIds: profiles.slice(0, 4),
        roundsPerWeek: 2,
      });
      const ended = state.selectedSeasonId;
      state = await command({ type: 'generate', seasonId: ended });
      const fixture = state.fixtures.find((f) => f.seasonId === ended)!;
      const home = state.participants.find((p) => p.id === fixture.homeId)!.playerIds[0];
      const away = state.participants.find((p) => p.id === fixture.awayId)!.playerIds[0];
      await command(
        { type: 'submit', fixtureId: fixture.id, score: { home: 2, away: 0 } },
        users[profiles.indexOf(home)],
      );
      await command(
        { type: 'review', fixtureId: fixture.id, approve: true, reason: '' },
        users[profiles.indexOf(away)],
      );
      state = await command({ type: 'endSeason', seasonId: ended, reason: 'Test season finished' });
      expect(state.seasons.find((s) => s.id === ended)!.status).toBe('complete');
      expect(state.fixtures.find((f) => f.id === fixture.id)!.history).toHaveLength(2);
      expect(
        state.fixtures
          .filter((f) => f.seasonId === ended && f.id !== fixture.id)
          .every((f) => f.status === 'cancelled' && f.history.at(-1)?.action === 'cancelled'),
      ).toBe(true);
      await expect(
        command({ type: 'deleteSeason', seasonId: ended, confirmName: `${prefix} ended` }),
      ).rejects.toThrow('history');
    });
    it('persists casual singles and doubles, opposing approval, corrections and void history', async () => {
      const id = crypto.randomUUID();
      const before = await service.load(users[1]);
      const result = {
        id,
        homePlayerIds: [profiles[1]],
        awayPlayerIds: [profiles[2]],
        playedOn: '2026-01-01',
        bestOf: 3 as const,
        score: { home: 2, away: 1 },
      };
      await command({ type: 'submitCasual', result }, users[1]);
      await expect(
        command({ type: 'reviewCasual', id, approve: true, reason: '' }, users[1]),
      ).rejects.toThrow('opposing');
      await expect(
        command({ type: 'reviewCasual', id, approve: true, reason: '' }, users[3]),
      ).rejects.toThrow('opposing');
      expect((await service.publicState()).casualResults?.some((r) => r.id === id)).toBe(false);
      const loaded = await service.load(users[2]);
      const approvals = await Promise.allSettled(
        [1, 2].map(() =>
          service.execute(
            users[2],
            { type: 'reviewCasual', id, approve: true, reason: '' },
            loaded.revision!,
          ),
        ),
      );
      expect(approvals.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await service.load(users[1])).fixtures).toEqual(before.fixtures);
      expect(
        (await service.publicState()).casualResults?.find((r) => r.id === id)?.history,
      ).toEqual([]);
      await command(
        { type: 'resolveCasual', id, score: { home: 2, away: 0 }, reason: 'Players checked' },
        users[0],
      );
      await command({ type: 'voidCasual', id, reason: 'Duplicate' }, users[0]);
      expect(
        (await service.load(users[0]))
          .casualResults!.find((r) => r.id === id)!
          .history.map((h) => h.action),
      ).toEqual(['submitted', 'approved', 'corrected', 'cancelled']);
      const doublesId = crypto.randomUUID();
      await command(
        {
          type: 'submitCasual',
          result: {
            ...result,
            id: doublesId,
            homePlayerIds: [profiles[1], profiles[3]],
            awayPlayerIds: [profiles[2], profiles[4]],
          },
        },
        users[1],
      );
      await expect(
        command({ type: 'reviewCasual', id: doublesId, approve: true, reason: '' }, users[3]),
      ).rejects.toThrow('opposing');
      await command({ type: 'reviewCasual', id: doublesId, approve: true, reason: '' }, users[4]);
      expect(
        (await service.load(users[0])).casualResults!.find((r) => r.id === doublesId)!.status,
      ).toBe('confirmed');
      const grants = await pool.query(
        "SELECT has_table_privilege('anon','public.casual_results','SELECT') AS anon,has_table_privilege('authenticated','public.casual_results','INSERT') AS client",
      );
      expect(grants.rows[0]).toEqual({ anon: false, client: false });
      await expect(
        pool.query('UPDATE public.casual_results SET history=$2 WHERE id=$1', [doublesId, '[]']),
      ).rejects.toThrow();
    });
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
    it('synchronizes self and administrator name edits to Auth without replacing other metadata', async () => {
      const before = await auth.auth.admin.getUserById(users[1].id);
      if (before.error) throw before.error;
      const untouched = await auth.auth.admin.getUserById(users[2].id);
      const renamed = await command(
        { type: 'updateProfile', name: '  Updated colleague  ' },
        users[1],
      );
      expect(renamed.players.find((p) => p.id === profiles[1])!.name).toBe('Updated colleague');
      let account = await auth.auth.admin.getUserById(users[1].id);
      expect(account.error).toBeNull();
      expect(account.data.user!.user_metadata).toEqual({
        ...before.data.user.user_metadata,
        name: 'Updated colleague',
      });
      await command({
        type: 'savePlayer',
        id: profiles[1],
        name: 'Administrator edited',
        department: '',
        active: true,
      });
      account = await auth.auth.admin.getUserById(users[1].id);
      expect(account.data.user!.user_metadata).toEqual({
        ...before.data.user.user_metadata,
        name: 'Administrator edited',
      });
      expect((await auth.auth.admin.getUserById(users[2].id)).data.user!.user_metadata).toEqual(
        untouched.data.user!.user_metadata,
      );
      await expect(
        command(
          {
            type: 'savePlayer',
            id: profiles[2],
            name: 'Unauthorized',
            department: '',
            active: true,
          },
          users[1],
        ),
      ).rejects.toThrow('Administrator');
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
    it('serializes pool/table-tennis reservations and enforces owner/admin access', async () => {
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
        (['pool', 'table_tennis'] as const).map((sport) =>
          service.execute(
            users[4],
            { type: 'saveBooking', booking: { ...booking, sport } },
            state.revision!,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const next = await service.load(users[4]);
      const b = next.bookings.find((b) => b.ownerId === profiles[4] && b.status === 'reserved')!;
      expect(['pool', 'table_tennis']).toContain(b.sport);
      const tennis = await command(
        { type: 'saveBooking', id: b.id, booking: { ...booking, sport: 'table_tennis' } },
        users[4],
      );
      expect(tennis.bookings.find((row) => row.id === b.id)!.sport).toBe('table_tennis');
      expect((await service.publicState()).bookings.find((row) => row.id === b.id)!.sport).toBe(
        'table_tennis',
      );
      await expect(
        pool.query("UPDATE public.table_bookings SET sport='invalid' WHERE id=$1", [b.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query("UPDATE public.table_bookings SET kind='league' WHERE id=$1", [b.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          "INSERT INTO public.table_bookings(owner_id,kind,sport,start_at,end_at,duration) SELECT owner_id,kind,'pool',start_at,end_at,duration FROM public.table_bookings WHERE id=$1",
          [b.id],
        ),
      ).rejects.toMatchObject({ code: '23P01' });
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
      await pool.query(
        "INSERT INTO public.availability(profile_id,from_date,to_date,reason) VALUES($1,'2027-01-01','2027-01-02','PRIVATE-REASON')",
        [profiles[1]],
      );
      const regular = await service.load(users[2]);
      expect(regular.availability.some((a) => a.reason === 'PRIVATE-REASON')).toBe(false);
      expect(regular.notifications.every((n) => n.userId === profiles[2])).toBe(true);
      const display = await service.display();
      expect(JSON.stringify(display)).not.toContain('PRIVATE-REASON');
      expect(JSON.stringify(display)).not.toContain('auth_user_id');
    });
    it('rejects deleted Auth users even with a previously valid access token and preserves their profile', async () => {
      const bucket = await auth.storage.createBucket('profile-photos', { public: false });
      if (bucket.error && !bucket.error.message.toLowerCase().includes('already exists'))
        throw bucket.error;
      await expect(command({ type: 'deleteUser', id: profiles[4] }, users[1])).rejects.toThrow(
        'Administrator',
      );
      await expect(command({ type: 'deleteUser', id: profiles[0] })).rejects.toThrow('own account');
      const deleted = await command({ type: 'deleteUser', id: profiles[4] });
      expect(deleted.players.find((p) => p.id === profiles[4])).toMatchObject({
        name: 'Deleted user',
        active: false,
        deleted: true,
      });
      await expect(
        command({
          type: 'savePlayer',
          id: profiles[4],
          name: 'Restore',
          department: '',
          active: true,
        }),
      ).rejects.toThrow('Deleted accounts');
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
