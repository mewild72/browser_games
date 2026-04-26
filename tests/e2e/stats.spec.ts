import { expect, type Locator, test } from '@playwright/test';
import { openDialog, playHandToCompletion } from './_helpers';

/**
 * Stats persistence — finishing a hand increments `Hands played` and
 * the recent-games table becomes non-empty.
 *
 * Note: the Modal's backdrop carries `aria-hidden="true"`, removing
 * the dialog from the accessibility tree, so we use the `openDialog`
 * helper (CSS-based locator) instead of `getByRole`.
 *
 * Owner: svelte-qa-validator
 */

test.setTimeout(90_000);

test.describe('Stats', () => {
  test('hand count increments and recent-games shows up after one hand', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('euchre.pref.botDelayMs', '0');
    });

    await page.goto('/');

    // Open Stats and read the initial Hands played count.
    await page.getByRole('button', { name: /^Stats$/ }).click();
    let dialog = openDialog(page, 'Stats');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('p', { hasText: /^Loading/i })).toBeHidden({
      timeout: 5_000,
    });

    let initialHands = 0;
    if (
      await dialog
        .locator('p', { hasText: /no games played yet/i })
        .isVisible()
        .catch(() => false)
    ) {
      initialHands = 0;
    } else {
      initialHands = await readHandsPlayed(dialog);
    }

    // Close the modal.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Run a hand to completion.
    await playHandToCompletion(page);

    // Re-open Stats.
    await page.getByRole('button', { name: /^Stats$/ }).click();
    dialog = openDialog(page, 'Stats');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('p', { hasText: /^Loading/i })).toBeHidden({
      timeout: 5_000,
    });

    // No longer empty.
    await expect(
      dialog.locator('p', { hasText: /no games played yet/i }),
    ).toBeHidden();

    const newHands = await readHandsPlayed(dialog);
    expect(newHands).toBeGreaterThan(initialHands);

    // Recent games heading and at least one row.
    await expect(dialog.locator('h3', { hasText: /recent games/i })).toBeVisible();
    const recentRows = dialog.locator('.stat-table').last().locator('tbody tr');
    expect(await recentRows.count()).toBeGreaterThan(0);
  });
});

async function readHandsPlayed(dialog: Locator): Promise<number> {
  const handsRow = dialog
    .locator('.summary .row')
    .filter({ has: dialog.page().locator('dt', { hasText: /^Hands played$/i }) })
    .first();
  const ddText = (await handsRow.locator('dd').textContent()) ?? '0';
  return Number(ddText.trim()) || 0;
}
