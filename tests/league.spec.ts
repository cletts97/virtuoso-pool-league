import { test, expect } from '@playwright/test';
import type { LeagueState } from '../src/domain/types';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
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
  await page.getByLabel('Starts on').fill('2027-01-04');
  await page.getByRole('dialog').getByLabel('Charlotte Evans', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Create draft season' }).click();
  await expect(
    page.getByRole('heading', { name: 'Winter Test League', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate fixtures', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Generate fixtures', exact: true })
    .click();
  await expect(page.locator('.admin-season').first()).toContainText('55 league fixtures');
  await page.goto('/fixtures');
  await expect(page.locator('.match-card')).toHaveCount(55);
  await expect(page.getByText(/Bye this round:/)).toHaveCount(11);
  await page.locator('.match-card').first().click();
  await page.getByRole('button', { name: 'Postpone match' }).click();
  await page.getByLabel('New due date').fill('2027-02-15');
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
  await expect(page.getByText('YOUR LEAGUE CHAMPION', { exact: true })).toBeVisible();
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

test('admin manages players, leave and notices with real state changes', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Players', exact: true }).click();
  await page.getByRole('button', { name: 'Add player' }).click();
  await page.getByLabel('Full name').fill('Robin Hayes');
  await page.getByLabel('Department', { exact: true }).fill('Engineering');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('tabpanel').getByText('Robin Hayes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Robin Hayes' }).click();
  await page.getByLabel('Active player').uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.managed-player').filter({ hasText: 'Robin Hayes' })).toContainText(
    'Inactive',
  );
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  await page.getByRole('button', { name: 'Record unavailability' }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-12-20');
  await page.getByLabel('Until', { exact: true }).fill('2026-12-31');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('2026-12-20 → 2026-12-31 · Annual leave')).toBeVisible();
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
  await expect(page.getByText('YOUR LEAGUE CHAMPION', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('YOUR LEAGUE CHAMPION', { exact: true })).toBeVisible();
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
