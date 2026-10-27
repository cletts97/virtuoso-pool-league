import { test, expect } from '@playwright/test';
import type { LeagueState } from '../src/domain/types';

test('administrator can enroll in an older draft, delete an unused season and end a test season', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    const base = state.seasons.find((s) => s.status === 'regular')!;
    state.seasons.unshift({
      ...base,
      id: 'old-draft',
      name: 'Old test draft',
      startDate: '2026-01-01',
      status: 'draft',
      participantIds: base.participantIds.slice(0, 4),
      qualifiers: [],
      championId: undefined,
      finalizedReason: undefined,
    });
    state.selectedSeasonId = 'old-draft';
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add player to season', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('First fixture week (Monday)')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Player', exact: true }).selectOption('colleague-01');
  await dialog.getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.admin-season').first()).toContainText('5 players');
  await page.getByRole('button', { name: 'Delete season', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete season permanently' })).toBeDisabled();
  await dialog.getByLabel('Confirm season name').fill('Old test draft');
  await dialog.getByRole('button', { name: 'Delete season permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Select season')).not.toContainText('Old test draft');
  await expect(page.getByRole('button', { name: 'Delete season', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'End season', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason for ending').fill('This season was only for testing');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'End season', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add player to season', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.admin-season').first()).toContainText(
    'Ended early: This season was only for testing',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'End season', exact: true })).toHaveCount(0);
});

test('administrator queue includes and resolves casual disputes independently of season', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    state.casualResults = [1, 2].map((size) => ({
      id: crypto.randomUUID(),
      homePlayerIds: size === 1 ? ['p02'] : ['p02', 'p03'],
      awayPlayerIds: size === 1 ? ['p04'] : ['p04', 'p05'],
      playedOn: '2026-10-01',
      bestOf: 3,
      score: { home: 2, away: 1 },
      status: 'disputed',
      submittedBy: 'p02',
      history: [
        {
          id: crypto.randomUUID(),
          actorId: 'p02',
          action: 'submitted',
          at: '2026-10-01T12:00:00Z',
          score: { home: 2, away: 1 },
        },
        {
          id: crypto.randomUUID(),
          actorId: 'p04',
          action: 'disputed',
          at: '2026-10-01T12:05:00Z',
          reason: 'The recorded score is wrong',
          score: { home: 2, away: 1 },
        },
      ],
    }));
    // This historical season has no league disputes; casual disputes must still appear.
    state.selectedSeasonId = 'summer-2026';
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.reload();
  const count = page
    .locator('.stat-card')
    .filter({ has: page.getByText('Disputed results', { exact: true }) })
    .locator('.stat-value');
  await expect(count).toHaveText('2');
  await page.getByRole('tab', { name: 'Fixtures & disputes' }).click();
  await expect(page.getByRole('heading', { name: 'No disputed results', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.casual-game')).toHaveCount(2);
  await expect(page.locator('.casual-game').first()).toContainText('Casual singles');
  await expect(page.locator('.casual-game').last()).toContainText('Casual doubles');
  await expect(page.locator('.casual-game').first()).toContainText('The recorded score is wrong');
  await page.getByRole('button', { name: 'Resolve casual result' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Score (Side A – Side B)').selectOption('2:0');
  await dialog.getByLabel('Reason', { exact: true }).fill('Confirmed with both players');
  await dialog.getByRole('button', { name: 'Confirm correction', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(count).toHaveText('1');
  await expect(page.locator('.casual-game')).toHaveCount(1);
  await page.reload();
  await expect(count).toHaveText('1');
  const resolved = await page.evaluate(() =>
    (
      JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState
    ).casualResults!.find((r) => r.status === 'confirmed')!,
  );
  expect(resolved.score).toEqual({ home: 2, away: 0 });
  expect(resolved.history.map((h) => h.action)).toEqual(['submitted', 'disputed', 'corrected']);
});

test('casual singles and doubles results persist and require opposing confirmation', async ({
  page,
}) => {
  await page.goto('/casual');
  await page.getByRole('button', { name: 'Record a game', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByLabel('Side B player 1').selectOption('p02');
  await form.getByLabel('Score (Side A – Side B)').selectOption('2:1');
  await form.getByRole('button', { name: 'Submit result', exact: true }).click();
  await expect(page.locator('.casual-game')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Confirm result', exact: true })).toHaveCount(0);
  await page.getByLabel('Playing as').selectOption('p02');
  await page.getByLabel('Select season').selectOption('summer-2026');
  await page.goto('/notifications');
  await expect(
    page.getByRole('heading', { name: 'Casual result needs your review', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Review casual result →', exact: true }).click();
  await expect(page).toHaveURL(/casual\?result=/);
  await page.getByRole('button', { name: 'Confirm result', exact: true }).click();
  await expect(page.locator('.casual-totals')).toContainText('1 confirmed games');
  await page.goto('/casual');
  await page.reload();
  await expect(page.locator('.casual-game')).toHaveCount(1);
  await page.getByRole('button', { name: 'Record a game', exact: true }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('Game type', { exact: true }).selectOption('2');
  await form.getByLabel('Side A player 2').selectOption('p03');
  await form.getByLabel('Side B player 1').selectOption('p04');
  await form.getByLabel('Side B player 2').selectOption('p05');
  await form.getByLabel('Score (Side A – Side B)').selectOption('2:0');
  await form.getByRole('button', { name: 'Submit result', exact: true }).click();
  await expect(page.locator('.casual-game')).toHaveCount(2);
  await page.getByLabel('Playing as').selectOption('p03');
  await expect(page.getByRole('button', { name: 'Confirm result', exact: true })).toHaveCount(0);
  await page.getByLabel('Playing as').selectOption('p04');
  await page.getByRole('button', { name: 'Confirm result', exact: true }).click();
  await page.getByLabel('Game type', { exact: true }).selectOption('2');
  await page.getByLabel('Team A player 1').selectOption('p03');
  await page.getByLabel('Team A player 2').selectOption('p02');
  await page.getByLabel('Team B player 1').selectOption('p05');
  await page.getByLabel('Team B player 2').selectOption('p04');
  await expect(page.locator('.casual-totals')).toContainText('1 confirmed games');
  await expect(page.locator('.casual-totals')).toContainText('Frames 2 – 0');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('administrator adds a late player without changing existing matches', async ({ page }) => {
  await page.goto('/admin');
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState,
  );
  const season = before.seasons.find((s) => s.id === before.selectedSeasonId)!;
  await page.getByRole('button', { name: 'Add player to season', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Player', exact: true })).toBeEnabled();
  await page
    .getByLabel('First fixture week (Monday)')
    .fill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  await page
    .getByRole('button', {
      name: `Add player and ${season.participantIds.length} fixtures`,
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState,
  );
  expect(after.fixtures.slice(0, before.fixtures.length)).toEqual(before.fixtures);
  expect(after.fixtures.slice(before.fixtures.length)).toHaveLength(season.participantIds.length);
  expect(after.fixtures.slice(before.fixtures.length).every((f) => f.status === 'scheduled')).toBe(
    true,
  );
  expect(after.seasons.find((s) => s.id === season.id)!.participantIds).toHaveLength(
    season.participantIds.length + 1,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'League administration' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!).fixtures.length,
    ),
  ).toBe(after.fixtures.length);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
});

test('all primary screens render without runtime errors or page overflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of [
    '/',
    '/standings',
    '/fixtures',
    '/players',
    '/players/entry-p01',
    '/playoffs',
    '/notifications',
    '/admin',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.locator('main')).not.toContainText('Something interrupted');
    await expect(page.locator('main')).not.toContainText(/\bpoints\b|\bPTS\b/i);
    if (['/', '/standings', '/playoffs'].includes(path))
      await page.screenshot({
        path: `.tools/screenshots/${testInfo.project.name}-${path === '/' ? 'dashboard' : path.slice(1)}.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
});

test('standings expose the agreed columns, sorting and qualification labels', async ({ page }) => {
  await page.goto('/standings');
  await expect(page.locator('thead th')).toHaveText([
    'Pos',
    'Player',
    'P',
    'W',
    'L',
    'F',
    'A',
    '+/-',
    'Win %',
  ]);
  await expect(
    page.getByText('Top four · Provisional playoff positions', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('tbody tr.qualifying')).toHaveCount(4);
  await page.getByRole('button', { name: 'Sort by matches won', exact: true }).click();
  await expect(
    page
      .locator('th')
      .filter({ has: page.getByRole('button', { name: 'Sort by matches won', exact: true }) }),
  ).toHaveAttribute('aria-sort', 'descending');
  const wins = await page.locator('td.wins').allTextContents();
  expect(wins.map(Number)).toEqual(wins.map(Number).sort((a, b) => b - a));
  await page.getByRole('button', { name: 'Sort by league position', exact: true }).click();
  await page.getByLabel('Select season').selectOption('summer-2026');
  await expect(
    page.getByText('Confirmed playoff qualifiers · Seeds locked', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('tbody tr.qualifying')).toHaveCount(4);
});

test('legacy demo data migrates on refresh without changing approved results', async ({ page }) => {
  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    const legacy = {
      ...state,
      version: 1,
      seasons: state.seasons.map((s) => ({ ...s, config: { ...s.config, pointsPerWin: 3 } })),
      announcements: state.announcements.map((a) => ({
        ...a,
        body: a.body.replace('Every match win counts.', 'Three points for a win.'),
      })),
    };
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(legacy));
    return state;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState,
  );
  expect(after).toEqual(before);
  await expect(page.locator('main')).not.toContainText(/\bpoints\b/i);
});

test('submit, switch to opponent, approve, update standings and persist after refresh', async ({
  page,
}) => {
  await page.goto('/fixtures/autumn-2026-r6-0');
  await page.getByRole('button', { name: 'Submit result', exact: true }).click();
  await page.getByRole('dialog').getByRole('radio').first().check();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main').getByText('Awaiting approval', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve result', exact: true })).toHaveCount(0);
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState,
  );
  const match = before.fixtures.find((f) => f.id === 'autumn-2026-r6-0')!;
  const opponent = before.participants.find(
    (p) => [match.homeId, match.awayId].includes(p.id) && !p.playerIds.includes('p01'),
  )!.playerIds[0];
  await page.getByLabel('Playing as').selectOption(opponent);
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve result', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm result' }).click();
  await expect(page.locator('main').getByText('Confirmed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('main').getByText('Confirmed', { exact: true })).toBeVisible();
  await page.goto('/standings');
  await expect(page.locator('table tbody tr')).toHaveCount(12);
  const homeRow = page
    .locator('tr')
    .filter({ has: page.locator(`a[href="/players/${match.homeId}"]`) });
  const originalWins = before.fixtures.filter(
    (f) =>
      f.seasonId === match.seasonId &&
      f.stage === 'regular' &&
      f.status === 'confirmed' &&
      ((f.homeId === match.homeId && f.score!.home > f.score!.away) ||
        (f.awayId === match.homeId && f.score!.away > f.score!.home)),
  ).length;
  await expect(homeRow.locator('.wins')).toHaveText(String(originalWins + 1));
});

test('administrator creates an odd-player season, publishes fixtures and postpones a match', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Create season', exact: true }).click();
  await page.getByLabel('Season name').fill('Winter Test League');
  await page.getByLabel('Start week (Monday)').fill('2027-01-04');
  await page.getByRole('dialog').getByLabel('Charlotte Evans', { exact: true }).uncheck();
  await page.getByRole('dialog').getByLabel('Riley Bennett', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Create draft season' }).click();
  await expect(
    page.getByRole('heading', { name: 'Winter Test League', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate fixtures', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Generate fixtures', exact: true })
    .click();
  await expect(page.locator('.admin-season').first().first()).toContainText('55 league fixtures');
  const future = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    return state.fixtures.filter((f) => f.seasonId === state.selectedSeasonId);
  });
  expect(future.filter((f) => f.round <= 2).every((f) => f.dueDate === '2027-01-04')).toBe(true);
  expect(future.filter((f) => f.round === 3).every((f) => f.dueDate === '2027-01-11')).toBe(true);
  await page.goto('/fixtures');
  await expect(page.locator('.match-card')).toHaveCount(55);
  await expect(page.locator('.match-card').first()).toContainText('Week commencing 4 Jan 2027');
  await expect(page.getByText(/Bye this round:/)).toHaveCount(11);
  await page.locator('.match-card').first().click();
  await page.getByRole('button', { name: 'Postpone match' }).click();
  await page.getByLabel('New fixture week (Monday)').fill('2027-02-15');
  await page.getByLabel('Reason', { exact: true }).fill('Annual leave agreed with both players');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.page-heading .badge')).toHaveText('Postponed');
  await page.reload();
  await expect(page.locator('main')).toContainText('Annual leave agreed with both players');
});

test('disputes, admin resolution and result correction retain audit history', async ({ page }) => {
  await page.goto('/fixtures/autumn-2026-r5-0');
  const opponent = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    const match = state.fixtures.find((f) => f.id === 'autumn-2026-r5-0')!;
    return state.participants.find(
      (p) =>
        [match.homeId, match.awayId].includes(p.id) && !p.playerIds.includes(match.submittedBy!),
    )!.playerIds[0];
  });
  await page.getByLabel('Playing as').selectOption(opponent);
  await page.getByRole('button', { name: 'Dispute score' }).click();
  await page.getByLabel('Reason', { exact: true }).fill('The final frame was mine.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main').getByText('Disputed', { exact: true })).toBeVisible();
  await page.getByLabel('Playing as').selectOption('p01');
  await page.getByRole('button', { name: 'Resolve dispute' }).click();
  await page.getByRole('dialog').getByRole('radio').first().check();
  await page.getByLabel('Reason', { exact: true }).fill('Agreed with both players.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main').getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(page.locator('.timeline li')).toHaveCount(3);
});

test('historical champion, themes, notifications and access boundaries work', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({
    path: `.tools/screenshots/${testInfo.project.name}-light.png`,
    fullPage: true,
  });
  await page.getByLabel('Select season').selectOption('summer-2026');
  await page.goto('/playoffs');
  await expect(page.getByText('SEASON WINNER', { exact: true })).toBeVisible();
  const weeks = await page.locator('.bracket-match-footer').allTextContents();
  expect(weeks).toHaveLength(3);
  expect(new Set(weeks.map((text) => text.split(' · ')[0].trim())).size).toBe(1);
  expect(weeks.every((text) => text.includes('Week commencing'))).toBe(true);
  await page.getByLabel('Select season').selectOption('autumn-2026');
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await page.getByLabel('Playing as').selectOption('p02');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('admin manages players and notices without unavailability controls', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByLabel('Full name').fill('Robin Hayes');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('tabpanel').getByText('Robin Hayes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Robin Hayes' }).click();
  await page.getByLabel('Active player').uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.managed-player').filter({ hasText: 'Robin Hayes' })).toContainText(
    'Inactive',
  );
  await expect(page.getByRole('tab', { name: 'Availability', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Season & configuration' }).click();
  await page.getByRole('button', { name: 'Post announcement' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Catch-up Friday');
  await page
    .getByLabel('Message', { exact: true })
    .fill('Arrange your outstanding fixtures before the holiday.');
  await page.getByRole('dialog').getByRole('button', { name: 'Post announcement' }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Catch-up Friday' })).toBeVisible();
});

test('validation errors stay visible inside dialogs and keyboard tabs work', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Season & configuration' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Players', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByLabel('Full name').fill('   ');
  await page.getByLabel('Department', { exact: true }).fill('Engineering');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Player name is required',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('bracket finalizes and advances through the final to a champion', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Finalize regular season' }).click();
  await page.getByLabel('Reason for finalizing').fill('Catch-up period closed by agreement.');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Finalize and seed playoffs' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const semis = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    return state.fixtures
      .filter((f) => f.seasonId === state.selectedSeasonId && f.stage === 'semifinal')
      .map((f) => f.id);
  });
  async function play(fixtureId: string) {
    await page.goto(`/fixtures/${fixtureId}`);
    const players = await page.evaluate((id) => {
      const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
      const f = state.fixtures.find((f) => f.id === id)!;
      return [f.homeId, f.awayId].map(
        (pid) => state.participants.find((p) => p.id === pid)!.playerIds[0],
      );
    }, fixtureId);
    await page.getByLabel('Playing as').selectOption(players[0]);
    await page.getByRole('button', { name: 'Submit result', exact: true }).click();
    await page.getByRole('dialog').getByRole('radio').first().check();
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Playing as').selectOption(players[1]);
    await page.getByRole('button', { name: 'Approve result', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm result' }).click();
    await expect(page.locator('.page-heading .badge')).toHaveText('Confirmed');
  }
  for (const id of semis) await play(id);
  const finalId = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    return state.fixtures.find((f) => f.seasonId === state.selectedSeasonId && f.stage === 'final')!
      .id;
  });
  await play(finalId);
  await page.goto('/playoffs');
  await expect(page.getByText('SEASON WINNER', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('SEASON WINNER', { exact: true })).toBeVisible();
});

test('small phones and tablets retain navigation and contain wide tables', async ({ page }) => {
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/standings', '/playoffs']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'League table', exact: true }),
      ).toHaveAccessibleName('League table');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

test('player directory includes casual-only users and all-season stats without requiring a season', async ({
  page,
}) => {
  await page.goto('/players');
  await expect(page.locator('.player-card')).toHaveCount(13);
  const alexCard = page.locator('a.player-card[href="/players/p01"]');
  const before = await alexCard.locator('.player-card-stats').textContent();
  await page.getByLabel('Select season').selectOption('summer-2026');
  await expect(alexCard.locator('.player-card-stats')).toHaveText(before!);
  await page.locator('a.player-card[href="/players/colleague-01"]').click();
  await expect(page.locator('.profile-hero h1')).toContainText('Riley');
  await expect(page.locator('.stats-grid')).toContainText('0%');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!);
    state.seasons = [];
    state.participants = [];
    state.fixtures = [];
    state.selectedSeasonId = '';
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.goto('/players');
  await expect(page.locator('.player-card')).toHaveCount(13);
  await page.locator('a.player-card[href="/players/p01"]').click();
  await expect(page.locator('.profile-hero h1')).toHaveText('Alex Morgan');
  await expect(page.locator('.stats-grid')).toContainText('0%');
});

test('administrator deletes a user with Yes/No confirmation and no department field', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Oliver Grant', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Department', { exact: true })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Oliver Grant', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'No', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Delete Oliver Grant', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Oliver Grant', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Yes, delete user', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Oliver Grant', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Delete Oliver Grant', exact: true })).toHaveCount(
    0,
  );
});

test('dashboard advertises leagues and administrators approve join requests', async ({ page }) => {
  await page.getByLabel('Playing as').selectOption('colleague-01');
  await page.goto('/');
  const card = page
    .locator('.league-join-card')
    .filter({ has: page.getByRole('heading', { name: 'Autumn League 2026', exact: true }) });
  await expect(card).toContainText('League in progress');
  await card.getByRole('button', { name: 'Request to join', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Request pending', exact: true })).toBeDisabled();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Request pending', exact: true })).toBeDisabled();
  await page.getByLabel('Playing as').selectOption('p01');
  await page.goto('/notifications');
  await page.getByRole('link', { name: 'View join request →', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'League join requests', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Accept request', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'League join requests', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Playing as').selectOption('colleague-01');
  await page.goto('/notifications');
  await expect(
    page.getByRole('heading', { name: 'League join request accepted', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(card).toHaveCount(0);
});

test('dashboard advertises the start week for an upcoming league', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!);
    state.seasons.push({
      ...state.seasons[0],
      id: 'upcoming-demo',
      name: 'Winter sign-up',
      status: 'draft',
      startDate: '2027-01-04',
      participantIds: state.seasons[0].participantIds.slice(0, 4),
      qualifiers: [],
    });
    state.currentUserId = 'colleague-01';
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.goto('/');
  const card = page
    .locator('.league-join-card')
    .filter({ has: page.getByRole('heading', { name: 'Winter sign-up', exact: true }) });
  await expect(card).toContainText('Upcoming league');
  await expect(card).toContainText('Starts week commencing 4 Jan 2027');
  await expect(card.getByRole('button', { name: 'Join league', exact: true })).toBeEnabled();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((el) => el.clientWidth),
  );
  await card.screenshot({ path: `.tools/screenshots/join-league-${testInfo.project.name}.png` });
  await card.getByRole('button', { name: 'Join league', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.goto('/notifications');
  await expect(
    page.getByRole('heading', { name: 'League membership confirmed', exact: true }),
  ).toBeVisible();
});

test('dashboard clearly states when no league is scheduled', async ({ page }) => {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!);
    state.seasons = [];
    state.fixtures = [];
    state.participants = [];
    state.notifications = [];
    state.selectedSeasonId = '';
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'No league scheduled.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.dashboard-hero')).not.toContainText('Draft');
  await expect(page.locator('.dashboard-hero')).not.toContainText('0 players');
  await expect(
    page.locator('.dashboard-hero').getByRole('link', { name: 'Book the table' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Today at the table', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent results', exact: true })).toBeVisible();
});

test('administrator creates an empty draft for dashboard sign-ups', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Create season', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Season name').fill('Open sign-ups');
  const players = modal.getByRole('checkbox');
  for (let i = 0; i < (await players.count()); i++) await players.nth(i).uncheck();
  await modal.getByRole('button', { name: 'Create draft season', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate fixtures', exact: true })).toBeDisabled();
  await expect(
    page.getByText('At least four players must join before fixtures can be generated.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Playing as').selectOption('colleague-01');
  await page.goto('/');
  const card = page
    .locator('.league-join-card')
    .filter({ has: page.getByRole('heading', { name: 'Open sign-ups', exact: true }) });
  await card.getByRole('button', { name: 'Join league', exact: true }).click();
  await expect(card).toHaveCount(0);
});
