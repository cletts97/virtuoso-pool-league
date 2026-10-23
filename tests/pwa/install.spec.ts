import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

async function controlled(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test('production manifest, icons and hosting headers support installation', async ({ page }) => {
  await controlled(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'Virtuoso Pool League',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    const bytes = await response.body();
    const size = Number(icon.sizes.split('x')[0]);
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  );
  const hosting = JSON.parse(readFileSync('public/staticwebapp.config.json', 'utf8'));
  expect(hosting.navigationFallback.exclude).toContain('/sw.js');
  expect(
    hosting.routes.find((r: { route: string }) => r.route === '/sw.js').headers['Cache-Control'],
  ).toBe('no-store');
});

test('Android-compatible install prompt is invoked only after a click', async ({ page }) => {
  await controlled(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        sessionStorage.setItem('install-prompt-clicked', 'true');
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  expect(await page.evaluate(() => sessionStorage.getItem('install-prompt-clicked'))).toBeNull();
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('install-prompt-clicked'))).toBe('true');
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
});

test('iPhone users see home-screen instructions in the mobile footer', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5175',
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Install app', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('On iPhone or iPad');
    await expect(dialog).toContainText('Add to Home Screen');
    await expect(dialog).toContainText('Open as Web App');
    await expect(dialog).toContainText('Safari');
    await page.screenshot({ path: '.tools/screenshots/pwa-iphone-instructions.png' });
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('private responses and invitation URLs are never cached; offline navigation uses a reconnect screen', async ({
  page,
  context,
}) => {
  await controlled(page);
  await page.route('**/api/pwa-privacy-probe', (route) =>
    route.fulfill({ json: { token: 'DO_NOT_CACHE_THIS_SECRET', email: 'private@example.test' } }),
  );
  expect(
    await page.evaluate(async () => (await fetch('/api/pwa-privacy-probe')).json()),
  ).toMatchObject({ token: 'DO_NOT_CACHE_THIS_SECRET' });
  await page.goto(
    '/auth/test-private-link?token_hash=DO_NOT_CACHE_THIS_SECRET#access_token=DO_NOT_CACHE_THIS_SECRET',
  );
  const cached = await page.evaluate(async () => {
    const entries: { url: string; text: string }[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys())
        entries.push({ url: request.url, text: await (await cache.match(request))!.text() });
    }
    return entries;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(
    cached.every(
      (r) => !r.url.includes('/api/') && !r.url.includes('/auth/') && !r.url.includes('?'),
    ),
  ).toBe(true);
  expect(JSON.stringify(cached)).not.toContain('DO_NOT_CACHE_THIS_SECRET');
  await context.setOffline(true);
  await page.goto('/bookings');
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
});

test('updates wait for explicit consent before reloading', async ({ page }) => {
  await controlled(page);
  const path = '.tools/pwa-dist/sw.js';
  const worker = readFileSync(path, 'utf8');
  try {
    writeFileSync(path, worker + '\n// test-update-' + Date.now());
    await page.evaluate(async () => {
      sessionStorage.setItem('update-test-state', 'preserved');
      (window as Window & { pwaUnsaved?: boolean }).pwaUnsaved = true;
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(page.getByText('An app update is available', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => (window as Window & { pwaUnsaved?: boolean }).pwaUnsaved),
    ).toBe(true);
    await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { pwaUnsaved?: boolean }).pwaUnsaved))
      .toBeUndefined();
    expect(await page.evaluate(() => sessionStorage.getItem('update-test-state'))).toBe(
      'preserved',
    );
  } finally {
    writeFileSync(path, worker);
  }
});

test('installed mode hides installation controls and the TV never registers a worker', async ({
  browser,
}) => {
  const installed = await browser.newContext({ baseURL: 'http://127.0.0.1:5175' });
  try {
    await installed.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { value: true }),
    );
    const page = await installed.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome, Alex.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
  } finally {
    await installed.close();
  }
  const tv = await browser.newContext({
    baseURL: 'http://127.0.0.1:5175',
    userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/53.0',
  });
  try {
    const page = await tv.newPage();
    await page.goto('/display');
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0);
  } finally {
    await tv.close();
  }
});
