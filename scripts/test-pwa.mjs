import { spawnSync } from 'node:child_process';
// Isolated mock build: never uses cloud accounts or replaces the deployment dist folder.
const build = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.tools/pwa-dist'],
  { env: { ...process.env, VITE_DATA_MODE: 'mock' }, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.pwa.config.ts',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
