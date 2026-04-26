import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * file:// portability smoke test — confirms the production build runs
 * directly from disk with no HTTP server. This is the USB-portability
 * promise: copy `dist/` to a thumb drive, double-click `index.html`,
 * the game works.
 *
 * Pre-requisite: `npm run build` has been run. The test reads from
 * `dist/index.html`. If the dist is missing the test is skipped with
 * a clear message rather than failing.
 *
 * Browser flag note: the production build is a single self-contained
 * `dist/index.html` (via `vite-plugin-singlefile` — JS/CSS/card art are
 * all base64-inlined). Because there are no separate module chunks to
 * fetch cross-origin, the file:// CORS restrictions on ES-module imports
 * no longer apply, and `--allow-file-access-from-files` is no longer
 * required to load the build in headless Chromium.
 *
 * Owner: svelte-qa-validator
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_INDEX = resolve(__dirname, '../../dist/index.html');

test.describe('file:// portability', () => {
  test.skip(
    !existsSync(DIST_INDEX),
    `dist/index.html is missing; run \`npm run build\` first. Path: ${DIST_INDEX}`,
  );

  test('opens dist/index.html and renders the game', async ({ page }) => {
    const fileUrl = pathToFileURL(DIST_INDEX).href;
    await page.goto(fileUrl);

    // Same smoke checks as smoke.spec.ts.
    await expect(
      page.getByRole('heading', { level: 1, name: /euchre/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('region', { name: /euchre game/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /south.*you/i }),
    ).toBeVisible();
    await expect(page.locator('.scoreboard')).toBeVisible();
  });
});
