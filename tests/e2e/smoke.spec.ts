import { expect, test } from '@playwright/test';

/**
 * Smoke test — the app loads, the heading renders, the table appears,
 * and the scoreboard reflects the initial state.
 *
 * Owner: svelte-qa-validator
 */

test.describe('Smoke', () => {
  test('app loads with heading, table, and starting scoreboard', async ({
    page,
  }) => {
    await page.goto('/');

    // Top-level heading.
    await expect(
      page.getByRole('heading', { level: 1, name: /euchre/i }),
    ).toBeVisible();

    // The Euchre game region.
    const gameRegion = page.getByRole('region', { name: /euchre game/i });
    await expect(gameRegion).toBeVisible();

    // At least one player seat (south-seat is the human seat).
    const southSeatHeading = page.getByRole('heading', {
      name: /south.*you/i,
    });
    await expect(southSeatHeading).toBeVisible();

    // Scoreboard shows starting NS / EW = 0.
    const scoreboard = page.getByRole('region').filter({
      has: page.locator('.scoreboard'),
    });
    await expect(scoreboard).toBeVisible();
    // Starting scores are 0 / 0; first cells are NS=0 and EW=0.
    await expect(page.locator('.scoreboard .cells .cell').first()).toContainText('NS');
    await expect(page.locator('.scoreboard .cells .cell').first()).toContainText('0');
    await expect(page.locator('.scoreboard .cells .cell').nth(1)).toContainText('EW');
    await expect(page.locator('.scoreboard .cells .cell').nth(1)).toContainText('0');
  });
});
