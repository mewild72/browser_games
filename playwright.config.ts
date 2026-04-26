import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the browser_games euchre MVP.
 *
 * MVP scope: chromium-only against the Vite dev server. Firefox/WebKit
 * coverage can be added later by appending projects below; the existing
 * tests are not browser-specific.
 *
 * Owner: svelte-qa-validator
 */
// Use 5174 instead of Vite's default 5173 to avoid colliding with a
// developer's dev server that is already running on the standard port
// (other projects in this workspace bind 5173 by default).
const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Plain `npm run dev` without --strictPort: when reuseExistingServer
    // is true and the URL is already serving, Playwright skips spawn.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
