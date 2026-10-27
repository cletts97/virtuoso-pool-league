import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueService } from '../src/service';
import { createHandler } from '../src/http';
import { createSeed } from '../../src/data/seed';
import { automaticallyConfirmResults, pendingHours } from '../../src/data/automaticResults';
import {
  mondayNewsletterWindow,
  newsletterEmailIntents,
  reminderEmailIntents,
} from '../src/scheduledEmails';
import type { CasualResult } from '../../src/domain/types';

const now = new Date('2026-10-26T07:00:00Z');
function scenario(hours: number) {
  const state = createSeed('2026-10-26');
  const fixture = state.fixtures.find((f) => f.status === 'pending')!;
  fixture.history = [
    {
      id: crypto.randomUUID(),
      action: 'submitted',
      actorId: fixture.submittedBy!,
      at: new Date(now.getTime() - hours * 3_600_000).toISOString(),
      score: fixture.score,
    },
  ];
  const casual: CasualResult = {
    id: crypto.randomUUID(),
    homePlayerIds: ['p02', 'p03'],
    awayPlayerIds: ['p04', 'p05'],
    playedOn: '2026-10-20',
    bestOf: 3,
    score: { home: 2, away: 1 },
    submittedBy: 'p02',
    status: 'pending',
    history: [{ ...fixture.history[0], id: crypto.randomUUID(), actorId: 'p02' }],
  };
  state.casualResults = [casual];
  return { state, fixture, casual };
}
describe('scheduled league operations', () => {
  it.each([23.999, 24, 47.999, 48])(
    'uses submission age boundaries (%s hours) for reminders and automatic approval',
    (hours) => {
      const { state, fixture, casual } = scenario(hours);
      expect(pendingHours(fixture, now)).toBeCloseTo(hours);
      const reminders = reminderEmailIntents(state, now, 'https://pool.example');
      const league = reminders.filter((i) => i.matchId === fixture.id);
      const doubles = reminders.filter((i) => i.matchId === casual.id);
      expect(league).toHaveLength(hours >= 24 && hours < 48 ? 1 : 0);
      expect(doubles.map((i) => i.recipientId).sort()).toEqual(
        hours >= 24 && hours < 48 ? ['p04', 'p05'] : [],
      );
      const next = automaticallyConfirmResults(state, now);
      expect(next.fixtures.find((f) => f.id === fixture.id)!.status).toBe(
        hours >= 48 ? 'confirmed' : 'pending',
      );
      expect(next.casualResults![0].status).toBe(hours >= 48 ? 'confirmed' : 'pending');
      if (hours >= 48) {
        expect(next.fixtures.find((f) => f.id === fixture.id)!.history.at(-1)).toMatchObject({
          action: 'auto_approved',
          actorId: null,
        });
        expect(automaticallyConfirmResults(next, now)).toEqual(next);
      }
      expect(fixture.status).toBe('pending');
    },
  );
  it('never approves disputes or closed seasons; a new submission restarts the clock', () => {
    const { state, fixture, casual } = scenario(60);
    fixture.status = 'disputed';
    casual.status = 'disputed';
    expect(automaticallyConfirmResults(state, now).casualResults![0].status).toBe('disputed');
    expect(reminderEmailIntents(state, now, 'https://pool.example')).toEqual([]);
    fixture.status = 'pending';
    state.seasons.find((s) => s.id === fixture.seasonId)!.status = 'complete';
    expect(
      automaticallyConfirmResults(state, now).fixtures.find((f) => f.id === fixture.id)!.status,
    ).toBe('pending');
    casual.status = 'pending';
    casual.history.push({ ...casual.history[0], id: crypto.randomUUID(), at: now.toISOString() });
    expect(automaticallyConfirmResults(state, now).casualResults![0].status).toBe('pending');
  });
  it('sends at 07:00 London time in both BST and GMT, never at the other UTC hour', () => {
    for (const at of ['2026-07-06T06:00:00Z', '2026-12-07T07:00:00Z'])
      expect(mondayNewsletterWindow(new Date(at))).toBe(true);
    for (const at of ['2026-07-06T07:00:00Z', '2026-12-07T06:00:00Z', '2026-10-25T07:00:00Z'])
      expect(mondayNewsletterWindow(new Date(at))).toBe(false);
  });
  it('skips empty weeks and drafts; sends escaped branded newsletters to every active account', () => {
    const { state, fixture } = scenario(0);
    state.fixtures = [fixture];
    fixture.status = 'scheduled';
    fixture.dueDate = '2026-11-02';
    expect(newsletterEmailIntents(state, now, 'https://pool.example')).toEqual([]);
    fixture.dueDate = '2026-11-01'; // Legacy Sunday date belongs to the same playing week.
    state.players[0].name = '<img onerror="bad">';
    state.players[1].active = false;
    const jobs = newsletterEmailIntents(state, now, 'https://pool.example');
    expect(jobs.map((j) => j.recipientId).sort()).toEqual(
      state.players
        .filter((p) => p.active)
        .map((p) => p.id)
        .sort(),
    );
    expect(jobs.some((j) => j.recipientId === 'colleague-01')).toBe(true);
    expect(jobs[0].html).toContain('&lt;img');
    expect(jobs[0].html).not.toContain('<img onerror');
    expect(jobs[0].html).toContain('/brand/virtuoso-white.png');
    expect(jobs[0].body).toContain('Week commencing 26 Oct 2026');
    expect(jobs[0].body).not.toContain('Due ');
    expect(newsletterEmailIntents(state, now, 'https://pool.example')[0].eventId).toBe(
      jobs[0].eventId,
    );
    state.seasons.find((s) => s.id === fixture.seasonId)!.status = 'draft';
    expect(newsletterEmailIntents(state, now, 'https://pool.example')).toEqual([]);
  });
  it('allows administrator-generated Tuesday previews with the same weekly deduplication key', () => {
    const { state, fixture } = scenario(0);
    state.fixtures = [fixture];
    fixture.status = 'scheduled';
    fixture.dueDate = '2026-10-26';
    const tuesday = new Date('2026-10-27T10:00:00Z');
    expect(newsletterEmailIntents(state, tuesday, 'https://pool.example')).toEqual([]);
    const manual = newsletterEmailIntents(state, tuesday, 'https://pool.example', true);
    expect(manual.length).toBeGreaterThan(0);
    expect(manual[0].eventId).toBe(
      newsletterEmailIntents(state, now, 'https://pool.example')[0].eventId,
    );
    state.fixtures = [];
    expect(newsletterEmailIntents(state, tuesday, 'https://pool.example', true)).toEqual([]);
  });
  it('requires a separate automation secret, never an app login or public request', async () => {
    const runAutomation = vi.fn(async () => ({ confirmed: 0 }));
    const identity = vi.fn();
    const config = { automationEnabled: true, automationSecret: 'a'.repeat(64) };
    const handle = createHandler(
      { runAutomation, identity } as unknown as LeagueService,
      {} as SupabaseClient,
      config as never,
    );
    for (const key of ['', 'forged'])
      expect(
        (
          await handle(
            new Request('https://pool.example/api/automation/results', {
              method: 'POST',
              headers: { 'X-VPL-Automation-Key': key },
            }),
          )
        ).status,
      ).toBe(401);
    expect(runAutomation).not.toHaveBeenCalled();
    expect(
      (
        await handle(
          new Request('https://pool.example/api/automation/results', {
            method: 'POST',
            headers: { 'X-VPL-Automation-Key': config.automationSecret },
          }),
        )
      ).status,
    ).toBe(200);
    expect(runAutomation).toHaveBeenCalledWith('results');
    expect(
      (
        await handle(
          new Request('https://pool.example/api/automation/emails', {
            method: 'POST',
            headers: { 'X-VPL-Automation-Key': config.automationSecret },
          }),
        )
      ).status,
    ).toBe(200);
    expect(runAutomation).toHaveBeenCalledWith('emails');
    expect(identity).not.toHaveBeenCalled();
    const disabled = createHandler(
      {} as LeagueService,
      {} as SupabaseClient,
      { ...config, automationEnabled: false } as never,
    );
    expect(
      (
        await disabled(
          new Request('https://pool.example/api/automation/results', { method: 'POST' }),
        )
      ).status,
    ).toBe(404);
  });
  it('includes only last week’s confirmed league results, and still skips an empty upcoming week', () => {
    const { state, fixture } = scenario(0);
    fixture.status = 'scheduled';
    fixture.dueDate = '2026-10-26';
    const result = {
      ...fixture,
      id: 'last-week',
      status: 'confirmed' as const,
      score: { home: 2, away: 0 },
      history: [{ ...fixture.history[0], action: 'approved' as const, at: '2026-10-25T20:00:00Z' }],
    };
    const older = {
      ...result,
      id: 'older',
      score: { home: 4, away: 0 },
      history: [{ ...result.history[0], at: '2026-10-18T20:00:00Z' }],
    };
    state.fixtures = [fixture, result, older];
    const jobs = newsletterEmailIntents(state, now, 'https://pool.example');
    expect(jobs[0].body).toContain('Last week’s confirmed league results');
    expect(jobs[0].body).toContain('2–0');
    expect(jobs[0].body).not.toContain('4–0');
    expect(jobs[0].html).toContain('Last week’s league results');
    state.fixtures = [result, older];
    expect(newsletterEmailIntents(state, now, 'https://pool.example')).toEqual([]);
  });
});
