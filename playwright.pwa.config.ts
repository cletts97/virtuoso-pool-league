import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pwa',
  outputDir: '.tools/pwa-test-results',
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5175 --strictPort --outDir .tools/pwa-dist',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
});
