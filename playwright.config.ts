import { defineConfig } from '@playwright/test';

// Timing tests need a quiet machine, so one worker by default (CI passes --workers=2 for Firefox and WebKit, where the
// budgets do not run).
// The budgets and the memory test only run in Chromium, everything else runs in all three engines.
export default defineConfig({
  testDir: './browser',
  workers: 1,
  retries: 0,
  reporter: [['dot']],
  timeout: 60_000,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] } },
    },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
