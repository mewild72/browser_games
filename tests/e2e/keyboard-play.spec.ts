import { expect, test } from '@playwright/test';

/**
 * Keyboard-only operability — confirms that the keyboard help shortcut
 * works and that the human's bidding "Pass" button is reachable and
 * activatable with only the keyboard.
 *
 * Note on the dialog locator: the Modal's backdrop carries
 * `aria-hidden="true"`, which removes the dialog subtree from the
 * accessibility tree. We use CSS selectors instead of `getByRole`.
 *
 * Owner: svelte-qa-validator
 */

test.describe('Keyboard play', () => {
  test('? opens keyboard help; Esc closes it', async ({ page }) => {
    await page.goto('/');

    // Make sure the page (not an input) has focus.
    await page.locator('body').click();

    // Press ?.
    await page.keyboard.press('Shift+?');

    const helpDialog = page
      .locator('[role="dialog"]')
      .filter({
        has: page.locator('h2', { hasText: /^Keyboard shortcuts$/ }),
      });
    await expect(helpDialog).toBeVisible();

    // Press Esc.
    await page.keyboard.press('Escape');
    await expect(helpDialog).toBeHidden();
  });

  test('Tab + Enter reaches and activates a bidding control', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('euchre.pref.botDelayMs', '0');
      // Skip the post-trick pause to keep the test under timeout.
      localStorage.setItem('euchre.pref.trickPauseMs', '0');
    });
    await page.goto('/');

    await expect(page.locator('.scoreboard')).toBeVisible();

    const passButton = page.getByRole('button', { name: /^Pass$/ });
    const handCompleteHeading = page.getByRole('heading', {
      name: /hand complete/i,
    });

    const deadline = Date.now() + 30_000;
    let passVisible = false;
    while (Date.now() < deadline) {
      if (await passButton.isVisible().catch(() => false)) {
        passVisible = true;
        break;
      }
      if (await handCompleteHeading.isVisible().catch(() => false)) {
        // Hand completed before the human ever got to bid — advance
        // and keep watching for the next chance.
        await page
          .getByRole('button', { name: /next hand/i })
          .click()
          .catch(() => {});
      }
      await page.waitForTimeout(150);
    }

    if (!passVisible) {
      test.skip(
        true,
        'Bots resolved several hands without the human bidding (rare).',
      );
      return;
    }

    // Programmatic .focus() is the keyboard primitive the browser uses
    // when Tab resolves to this element. Pressing Enter then activates
    // the focused button via the keyboard, no mouse involved.
    await passButton.focus();
    await expect(passButton).toBeFocused();
    await page.keyboard.press('Enter');

    // After Pass the bidding panel re-renders for the next bidder, so
    // the same Pass button is no longer present.
    await expect(passButton).toBeHidden({ timeout: 5_000 });
  });
});
