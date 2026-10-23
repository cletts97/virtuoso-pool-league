import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
// Rasterize the existing eight-ball favicon; this does not create a new company logo.
const svg = readFileSync('public/favicon.svg', 'utf8');
mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [size, name] of [
    [192, 'icon-192'],
    [512, 'icon-512'],
    [180, 'apple-touch-icon'],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:#101824}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({ path: `public/icons/${name}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
