import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared test helpers for the euchre E2E suite.
 *
 * Owner: svelte-qa-validator
 */

/**
 * Locate the open dialog whose `<h2>` title matches `title`. The Modal
 * wraps `[role="dialog"]` inside a backdrop with `aria-hidden="true"`,
 * which removes the dialog subtree from the accessibility tree —
 * `getByRole('dialog')` returns nothing — so this helper relies on a
 * plain CSS / DOM selector.
 */
export function openDialog(page: Page, title: string): Locator {
  return page
    .locator('[role="dialog"]')
    .filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) });
}

/**
 * Drive the game forward through one complete hand by handling every
 * possible human prompt. Bots make their own moves on the reactive
 * loop; this helper just unblocks the loop whenever the human is the
 * one being asked to act.
 *
 * Click order:
 *   1. Pass — round 1 / round 2 (human is not stuck dealer)
 *   2. Call <suit> — round 2 stuck dealer
 *   3. Discard a card — dealer-discard phase
 *   4. Play a card — playing phase, human's turn
 */
export async function playHandToCompletion(
  page: Page,
  opts: { readonly deadlineMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + (opts.deadlineMs ?? 60_000);
  const handCompleteHeading = page.getByRole('heading', {
    name: /hand complete/i,
  });
  const passButton = page.getByRole('button', { name: /^Pass$/ });

  while (
    !(await handCompleteHeading.isVisible().catch(() => false)) &&
    Date.now() < deadline
  ) {
    if (await passButton.isVisible().catch(() => false)) {
      await passButton.click();
    } else if (
      await page
        .getByRole('button', { name: /^Call/ })
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // Round 2 stuck dealer: pick the first non-rejected suit.
      await page
        .getByRole('button', { name: /^Call/ })
        .first()
        .click();
    } else if (
      await page
        .locator('.bidding .discard-list button.card.playable')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // Dealer-discard: pick any card.
      await page
        .locator('.bidding .discard-list button.card.playable')
        .first()
        .click();
    } else if (
      await page
        .locator('.south-seat button.card.playable')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      // Playing phase: play the first legal card.
      await page
        .locator('.south-seat button.card.playable')
        .first()
        .click();
    }
    // Yield so the bot loop can run.
    await page.waitForTimeout(80);
  }
  await expect(handCompleteHeading).toBeVisible({ timeout: 5_000 });
}
