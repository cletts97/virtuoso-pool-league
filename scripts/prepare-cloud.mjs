import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

// Read PUBLIC frontend settings only. Private api/.env is never loaded into a build.
const env = {
  ...(existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {}),
  ...process.env,
  VITE_DATA_MODE: 'api',
};
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  if (!env[name])
    throw new Error(
      `Set ${name} in the build environment or .env.local before preparing the cloud build.`,
    );
}
if (new URL(env.VITE_SUPABASE_URL).protocol !== 'https:')
  throw new Error('The cloud build requires an HTTPS Supabase project URL.');
if (!process.env.npm_execpath) throw new Error('Run this script using npm run prepare:cloud.');
function npm(...args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Vite also rejects privileged keys in public configuration before emitting assets.
npm('run', 'build');
npm('run', 'package:api');
npm('ci', '--omit=dev', '--prefix', '.tools/azure-api', '--workspaces=false');
console.log('Cloud artifacts ready: dist/ and .tools/azure-api/. Nothing has been deployed.');
