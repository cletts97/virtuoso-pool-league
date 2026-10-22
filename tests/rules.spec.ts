import { expect, test } from '@playwright/test';
import type { LeagueState } from '../src/domain/types';

test('dashboard and TV combine casual and league results with clear public statuses', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    const f = state.fixtures.find((f) => f.status === 'pending')!;
    f.history.push({
      id: 'latest-league',
      actorId: 'p01',
      at: '2098-01-01T12:00:00Z',
      action: 'submitted',
    });
    state.casualResults = [
      {
        id: crypto.randomUUID(),
        homePlayerIds: ['p01', 'p02'],
        awayPlayerIds: ['p03', 'p04'],
        playedOn: '2026-01-01',
        bestOf: 3,
        score: { home: 2, away: 1 },
        status: 'disputed',
        submittedBy: 'p01',
        history: [
          {
            id: 'casual-dispute',
            actorId: 'p03',
            at: '2099-01-01T12:00:00Z',
            action: 'disputed',
            reason: 'PRIVATE_DISPUTE_REASON',
          },
        ],
      },
    ];
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.reload();
  const results = page.locator('.result-list');
  await expect(results).toContainText('Casual doubles');
  await expect(results).toContainText('Disputed');
  await expect(results).toContainText('League singles');
  await expect(results).toContainText('Pending confirmation');
  await expect(results).not.toContainText('PRIVATE_DISPUTE_REASON');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/display');
  await expect(page.locator('.tv-results')).toContainText('Casual doubles');
  await expect(page.locator('.tv-results')).toContainText('Disputed');
  await expect(page.locator('.tv-results')).toContainText('Pending confirmation');
  await expect(page.locator('.tv-results')).not.toContainText('PRIVATE_DISPUTE_REASON');
  expect(
    await page.locator('.tv-results').evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
});

test('TV font and spacing fallbacks work without theme variables or flex gap', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T09:05:00Z') });
  for (const height of [1080, 900]) {
    await page.setViewportSize({ width: 1920, height });
    await page.goto('/display');
    await expect(page.locator('.tv-booking-row').first()).toBeVisible();
    // Simulate the missing CSS features; this is not an emulation of the webOS engine.
    await expect(page.locator('html')).not.toHaveClass(/no-flex-gap/);
    await page.evaluate(() => {
      document.documentElement.classList.add('no-flex-gap');
      document.documentElement.style.setProperty('--font-sans', 'initial');
      document.querySelectorAll('.tv-display *').forEach((element) => {
        if (
          element instanceof HTMLElement &&
          /^(inline-)?flex$/.test(getComputedStyle(element).display)
        )
          element.style.gap = '0px';
      });
    });
    expect(
      await page.locator('.tv-display').evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain('Arial');
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
      'Arial',
    );
    expect(
      await page.locator('caption').evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    expect(
      await page.locator('.tv-current .eyebrow').evaluate((el) => {
        const dot = el.querySelector('.live-dot')!.getBoundingClientRect();
        const text = [...el.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getBoundingClientRect().left - dot.right;
      }),
    ).toBeGreaterThanOrEqual(7);
    expect(
      await page
        .locator('.tv-booking-row')
        .first()
        .evaluate(
          (el) =>
            el.querySelector('div')!.getBoundingClientRect().left -
            el.querySelector('strong')!.getBoundingClientRect().right,
        ),
    ).toBeGreaterThanOrEqual(8);
    expect(
      await page
        .locator('.tv-grid > *')
        .evaluateAll((cards) =>
          cards
            .filter((card) => card.scrollHeight > card.clientHeight + 1)
            .map((card) => card.className),
        ),
    ).toEqual([]);
    await page.screenshot({ path: `.tools/screenshots/display-css-fallback-${height}.png` });
  }
});

test('short desktop viewports contain the TV QR tile and administrator sidebar footer', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-22T06:43:00Z') });
  for (const [width, height] of [
    [1920, 1080],
    [1920, 900],
    [1536, 700],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
    await expect(page.locator('.rule-reminders h3')).toHaveCount(4);
    const sidebar = page.locator('.sidebar');
    for (const selector of ['.league-note', '.company-link', 'a[href="/admin"]']) {
      const item = sidebar.locator(selector);
      await expect(item).toBeInViewport();
      expect(
        await item.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        `${selector} fits at ${width}x${height}`,
      ).toBe(true);
    }
    await page.goto('/display');
    await expect(page.locator('.tv-qr svg')).toBeVisible();
    await expect(page.locator('.rule-reminders h3')).toHaveCount(8);
    await expect(page.getByRole('img', { name: /Pool rack:/ })).toBeVisible();
    expect(
      await page.locator('.rule-rack img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
    const reminders = page.getByRole('region', { name: 'Rules to remember' });
    await expect(reminders).toBeInViewport({ ratio: 1 });
    expect(
      await reminders.evaluate((section) => {
        const bounds = section.getBoundingClientRect();
        return [...section.querySelectorAll('h2, h3, p, a')].every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom &&
            rect.left >= bounds.left &&
            rect.right <= bounds.right
          );
        });
      }),
      `All eight rules fit at ${width}x${height}`,
    ).toBe(true);
    expect(
      await page.locator('.tv-qr').evaluate((tile) => {
        const bounds = tile.getBoundingClientRect();
        return [...tile.querySelectorAll('svg, h2, p, span')].every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= bounds.left + 8 &&
            rect.right <= bounds.right - 8 &&
            rect.top >= bounds.top + 8 &&
            rect.bottom <= bounds.bottom - 8
          );
        });
      }),
      `QR image and copy fit with padding at ${width}x${height}`,
    ).toBe(true);
    expect(
      await page
        .locator('.tv-grid > *')
        .evaluateAll((cards) =>
          cards
            .filter((card) => card.scrollHeight > card.clientHeight + 1)
            .map((card) => card.className),
        ),
      `TV cards do not overflow at ${width}x${height}`,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    if (width === 1536)
      await page.screenshot({ path: '.tools/screenshots/display-browser-1080p.png' });
  }
});

test('rules are public, complete, responsive and navigable from the app and TV', async ({
  page,
}, info) => {
  await page.goto('/rules');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Virtuoso Pool League — Rules');
  await expect(page.locator('.rules-section')).toHaveCount(8);
  await expect(page.locator('.rules-section li')).toHaveCount(47);
  await expect(page.locator('#general')).toContainText('Only one foot needs to touch the floor');
  await expect(page.locator('#normal-play')).toContainText('properly nominated foul-snooker');
  await expect(page.locator('#normal-play')).toContainText('pot a ball on');
  await expect(page.locator('#snookers')).toContainText('first shot only');
  await expect(page.locator('#snookers')).toContainText('group is already cleared');
  await expect(page.locator('#starting')).toContainText('opponent breaks with two visits');
  expect(await page.evaluate(() => localStorage.getItem('virtuoso-pool-league.v1'))).toBeNull();
  const source = page.getByRole('link', { name: /Read the official rules/ });
  await expect(source).toHaveAttribute(
    'href',
    'https://epa.org.uk/images/rules/Pool%20Rules%20B3%20poster%20Oct%2019.pdf',
  );
  await page
    .getByRole('navigation', { name: 'Rules contents' })
    .getByRole('link', { name: 'Snookers', exact: true })
    .click();
  await expect(page).toHaveURL(/#snookers$/);
  await expect(page.locator('#snookers')).toBeInViewport();
  for (const width of [320, 768, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 320) {
      await page.screenshot({
        path: `.tools/screenshots/${info.project.name}-rules-small-phone.png`,
        fullPage: true,
      });
    }
  }
  await page.goto('/display');
  await expect(page.locator('.rule-reminders')).toContainText('normally a foul');
  await expect(page.locator('.rule-reminders')).toContainText('first shot only');
  await expect(page.locator('.rule-reminders')).toContainText(
    'Confirmed total snookers are exempt',
  );
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await expect(page).toHaveURL(/\/rules\?from=display$/);
  expect(
    await page
      .locator('.rules-section li')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  await page.screenshot({
    path: `.tools/screenshots/${info.project.name}-tv-rules.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Back to TV display', exact: true }).first().click();
  await expect(page.locator('.tv-grid')).toBeVisible();
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Rules', exact: true })
    .click();
  await page.getByRole('link', { name: 'Back to league', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
  await page.goto('/rules');
  await page.screenshot({
    path: `.tools/screenshots/${info.project.name}-rules.png`,
    fullPage: true,
  });
});

test('1080p TV cards contain full text with long names and a current booking', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install({ time: new Date('2026-10-20T09:05:00Z') });
  await page.goto('/bookings');
  await expect(page.getByRole('heading', { name: 'Table bookings' })).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('virtuoso-pool-league.v1')!) as LeagueState;
    state.players.forEach((p, i) => {
      p.name = `Georgina Jacqueline Montgomery-Blackwood ${i + 1}`;
    });
    state.participants.forEach((p) => {
      p.name = state.players.find((u) => u.id === p.playerIds[0])!.name;
    });
    // A busy current match and three future reservations exercise wrapping and queue paging.
    state.bookings[0].guestIds = ['p02', 'p04'];
    state.bookings.push({
      ...state.bookings[2],
      id: 'later-slot',
      startAt: '2026-10-20T15:00:00Z',
    });
    localStorage.setItem('virtuoso-pool-league.v1', JSON.stringify(state));
  });
  await page.goto('/display');
  await expect(page.locator('.tv-countdown strong')).toHaveText('25');
  const checkText = async () => {
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    const escaped = await page.locator('.tv-grid > *').evaluateAll((cards) => {
      const issues: string[] = [];
      for (const card of cards) {
        const bounds = card.getBoundingClientRect();
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim() || node.parentElement?.closest('svg, .sr-only')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (
              rect.left < bounds.left ||
              rect.right > bounds.right ||
              rect.top < bounds.top ||
              rect.bottom > bounds.bottom
            )
              issues.push(`${card.className}: ${node.textContent}`);
          }
        }
      }
      return issues;
    });
    expect(escaped).toEqual([]);
  };
  await checkText();
  await page.screenshot({ path: `.tools/screenshots/${info.project.name}-display-long-1080.png` });
  await page.clock.runFor(15_000);
  await checkText();
  await page.clock.setSystemTime(new Date('2026-10-20T18:00:00Z'));
  await page.clock.runFor(31_000);
  await expect(page.getByRole('heading', { name: 'Outside office hours' })).toBeVisible();
  await checkText();
});
