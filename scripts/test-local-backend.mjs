import { execFileSync, spawnSync } from 'node:child_process';
// Capture local secrets in memory; never print CLI status or write credentials to tracked files.
const raw = execFileSync(
  process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '--output', 'json'],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const local = JSON.parse(raw.slice(raw.indexOf('{')));
if (!['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname))
  throw new Error('Local tests refuse a cloud Supabase endpoint.');
const env = {
  ...process.env,
  RUN_DB_TESTS: 'true',
  DATABASE_URL: local.DB_URL,
  SUPABASE_URL: local.API_URL,
  SUPABASE_SECRET_KEY: local.SECRET_KEY || local.SERVICE_ROLE_KEY,
  SUPABASE_PUBLIC_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
  APP_URL: 'http://127.0.0.1:5173',
  WORK_EMAIL_DOMAINS: 'virtuoso.tech',
  ALLOW_AUTH_EMAIL: 'false',
  PUBLIC_DISPLAY_ENABLED: 'true',
};
const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'api/tests/integration.test.ts',
    ...process.argv.slice(2),
  ],
  { env, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
