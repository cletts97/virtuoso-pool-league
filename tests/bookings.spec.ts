import { expect, test } from '@playwright/test';
import type { LeagueState } from '../src/domain/types';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T08:00:00Z') });
  await page.goto('/bookings');
  await expect(page.getByRole('heading', { name: 'The table is yours.' })).toBeVisible();
});

test('casual colleague reserves, edits, refreshes and cancels without joining the league', async ({ page }) => {
  await page.getByLabel('Playing as').selectOption('colleague-01');
  await page.getByRole('button', { name: 'Reserve the table', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Duration', exact: true })).toHaveValue('30');
  await page.getByLabel('Booking date').fill('2026-10-21');
  await page.getByLabel('Available start time').selectOption({ label: '11:00' });
  await page.getByRole('dialog').getByLabel('Priya Shah', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Calendar stays on the day being browsed; choose the reservation's date.
  await page.getByRole('button', { name: /Wed.*21/ }).click();
  const card = page.locator('.booking-card').filter({ hasText: 'Riley Bennett' });
  await expect(card).toContainText('11:00–11:30');
  await expect(card).toContainText('Priya Shah');
  await card.getByRole('button', { name: 'Edit reservation' }).click();
  await page.getByRole('combobox', { name: 'Duration', exact: true }).selectOption('60');
  await page.getByLabel('Available start time').selectOption({ label: '13:00' });
  await page.getByRole('button', { name: 'Save reservation' }).click();
  await expect(card).toContainText('13:00–14:00');
  await page.reload();
  await page.getByRole('button', { name: /Wed.*21/ }).click();
  await expect(card).toContainText('13:00–14:00');
  await card.getByRole('button', { name: 'Cancel reservation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel('Show reservations').selectOption('cancelled');
  await expect(card).toContainText('Cancelled');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState);
  expect(stored.participants.some((p) => p.playerIds.includes('colleague-01'))).toBe(false);
  expect(stored.seasons[0].participantIds).toHaveLength(12);
});

test('slot selection, owner controls and admin opening hours work', async ({ page }) => {
  await page.getByLabel('Playing as').selectOption('p02');
  await expect(page.getByRole('button', { name: 'Opening hours' })).toHaveCount(0);
  await expect(page.locator('.booking-card').filter({ hasText: 'Riley Bennett' }).getByRole('button')).toHaveCount(0);
  await page.locator('.availability-slots').getByRole('button', { name: '11:00', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reserve the table', exact: true })).toBeVisible();
  await expect(page.getByLabel('Available start time')).toHaveValue('2026-10-20T10:00:00.000Z');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: 'Priya Shah' })).toBeVisible();
  await page.getByLabel('Playing as').selectOption('p01');
  await page.locator('.booking-card').filter({ hasText: 'Priya Shah' }).getByRole('button', { name: 'Edit reservation' }).click();
  await page.getByLabel('Available start time').selectOption({ label: '11:30' });
  await page.getByRole('button', { name: 'Save reservation' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: 'Priya Shah' })).toContainText('11:30–12:00');
  await page.getByRole('button', { name: 'Opening hours' }).click();
  await page.getByLabel('Closes at').fill('12:00');
  await page.getByRole('button', { name: 'Save opening hours' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('conflict');
  await page.getByLabel('Closes at').fill('17:00');
  await page.getByRole('button', { name: 'Save opening hours' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.booking-toolbar')).toContainText('08:00–17:00');
});

test('a stale calendar cannot save an overlapping reservation', async ({ page }) => {
  await page.getByRole('button', { name: 'Reserve the table', exact: true }).click();
  await page.getByLabel('Available start time').selectOption({ label: '11:00' });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    state.bookings.push({ ...state.bookings[0], id: 'other-tab', startAt: '2026-10-20T10:00:00.000Z' });
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already reserved');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('upcoming league fixture can reserve the table without changing its match record', async ({ page }) => {
  await page.goto('/fixtures/autumn-2026-r7-0');
  await page.getByRole('link', { name: 'Book the table', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Booking type')).toHaveValue('league');
  await expect(page.getByLabel('League fixture (optional)')).toHaveValue('autumn-2026-r7-0');
  await page.getByLabel('Available start time').selectOption({ label: '11:00' });
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await page.goto('/fixtures/autumn-2026-r7-0');
  await expect(page.getByRole('link', { name: 'View table reservation' })).toBeVisible();
  await expect(page.locator('.match-message')).toContainText('11:00–11:30');
  await expect(page.getByRole('button', { name: 'Submit result', exact: true })).toBeVisible();
});

test('TV is read-only, shows the current booking, advances time and refreshes across tabs', async ({ page, context }) => {
  await page.clock.setSystemTime(new Date('2026-10-20T09:05:00Z'));
  await page.goto('/display');
  await expect(page.getByRole('heading', { name: 'Riley Bennett', exact: true })).toBeVisible();
  await expect(page.locator('.tv-countdown strong')).toHaveText('25');
  await expect(page.locator('button, input, select, nav')).toHaveCount(0);
  await expect(page.locator('.tv-qr svg')).toHaveAccessibleName('Scan to book the pool table');
  await expect(page.locator('.tv-standings th')).toHaveText(['Pos', 'Player', 'P', 'W', 'L', '+/-']);
  await expect(page.locator('body')).not.toContainText(/@|Playing as|Administration/);
  const editor = await context.newPage();
  await editor.clock.install({ time: new Date('2026-10-20T09:05:00Z') });
  await editor.goto('/bookings');
  await editor.getByRole('button', { name: 'Reserve the table', exact: true }).click();
  await editor.getByLabel('Available start time').selectOption({ label: '11:00' });
  await editor.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.locator('.tv-queue')).toContainText('11:00');
  await editor.close();
  await page.clock.runFor(30 * 60 * 1000);
  await expect(page.getByRole('heading', { name: 'The table is free.' })).toBeVisible();
  await expect(page.locator('.tv-current')).toContainText('Next reservation at 11:00');
});

test('TV refresh survives stale data, recovers, and changes the day without interaction', async ({ page }) => {
  await page.goto('/display');
  const raw = await page.evaluate(() => localStorage.getItem('virtuoso-pool-league.v1')!);
  await page.evaluate(() => localStorage.setItem('virtuoso-pool-league.v1', '{broken'));
  await page.clock.runFor(31_000);
  await expect(page.locator('.tv-footer')).toContainText('Automatically retrying');
  await expect(page.getByRole('heading', { name: 'Checking availability…' })).toBeVisible();
  await page.evaluate((value) => localStorage.setItem('virtuoso-pool-league.v1', value), raw);
  await page.clock.runFor(31_000);
  await expect(page.getByRole('heading', { name: 'The table is free.' })).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-10-21T08:00:00Z'));
  await page.clock.runFor(31_000);
  await expect(page.locator('.tv-clock')).toContainText('Wed 21 Oct');
  await expect(page.locator('.tv-queue')).toContainText('No more bookings today.');
});

test('booking calendar and TV fit phone, laptop and 16:9 screens', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: 'The table is yours.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 768) await page.screenshot({ path: `.tools/screenshots/${info.project.name}-bookings-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.screenshot({ path: `.tools/screenshots/${info.project.name}-bookings-light.png`, fullPage: true });
  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/display');
    await expect(page.locator('.tv-qr svg')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    for (const selector of ['.tv-standings', '.tv-queue', '.tv-results', '.tv-qr']) {
      expect(await page.locator(selector).evaluate((el) => el.scrollHeight <= el.clientHeight + 1), `${selector} fits its TV card`).toBe(true);
    }
    await page.screenshot({ path: `.tools/screenshots/${info.project.name}-display-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
