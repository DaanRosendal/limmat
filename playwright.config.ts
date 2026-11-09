import { defineConfig } from '@playwright/test';

// Timing tests need a quiet machine, so one worker. Tests run against the built dist/ files.
export default defineConfig({
  testDir: './browser',
  workers: 1,
  retries: 0,
  reporter: [['dot']],
  timeout: 60_000,
  use: { browserName: 'chromium', launchOptions: { args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] } },
});
