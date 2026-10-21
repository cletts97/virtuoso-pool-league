import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Email tests use only the local mail sink; refuse configurations that enable custom SMTP.
const configuration = readFileSync('supabase/config.toml', 'utf8').replace(/^\s*#.*$/gm, '');
if (configuration.includes('[auth.email.smtp]'))
  throw new Error('Live email tests require the default local mail sink, without custom SMTP.');
const raw = execFileSync(
  process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '--output', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);
const local = JSON.parse(raw.slice(raw.indexOf('{')));
for (const value of [local.API_URL, local.DB_URL])
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname))
    throw new Error('Live tests refuse non-local endpoints.');
const env = {
  ...process.env,
  DATABASE_URL: local.DB_URL,
  SUPABASE_URL: local.API_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY || local.SERVICE_ROLE_KEY,
  SUPABASE_PUBLIC_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
  APP_URL: 'http://127.0.0.1:5174',
  WORK_EMAIL_DOMAINS: '*',
  ALLOW_AUTH_EMAIL: 'true',
  PUBLIC_DISPLAY_ENABLED: 'true',
  VITE_DATA_MODE: 'api',
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
  VITE_PUBLIC_APP_URL: 'http://127.0.0.1:5174',
};
const build = spawnSync(process.execPath, ['build.mjs'], { cwd: 'api', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const api = spawn(process.execPath, ['api/dist/dev.cjs'], { env, stdio: 'inherit' }),
  vite = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    { env, stdio: 'inherit' },
  );
async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // The local server may still be starting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Local server did not start.');
}
try {
  await ready('http://127.0.0.1:7071/api/me');
  await ready('http://127.0.0.1:5174/login');
  process.exitCode = await new Promise((resolve) => {
    const tests = spawn(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.live.config.ts'],
      { env, stdio: 'inherit' },
    );
    tests.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  api.kill();
  vite.kill();
}
