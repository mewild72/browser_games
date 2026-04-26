import { expect, test } from '@playwright/test';
import { playHandToCompletion } from './_helpers';

/**
 * Golden-path test — boot the app, race through bidding by pressing
 * "Pass" whenever the human is asked, let the bots play (with 0 ms
 * delay) until the hand completes, then advance with "Next hand".
 *
 * Owner: svelte-qa-validator
 */

test.setTimeout(90_000);

test.describe('Golden path', () => {
  test('finish a hand and advance to the next', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('euchre.pref.botDelayMs', '0');
      // Skip the post-trick display pause; the golden-path test plays
      // a hand quickly and would otherwise wait 5s × 5 tricks. The
      // pause itself is exercised by the unit tests.
      localStorage.setItem('euchre.pref.trickPauseMs', '0');
      // Auto-advance defaults to on; with `trickPauseMs=0` the next
      // hand would be dealt 300 ms after the 5th trick resolves,
      // which races the "Hand complete" heading assertion below.
      // Disable auto-advance so the golden path exercises the manual
      // "Next hand" click. The auto-advance behaviour itself is
      // covered by unit tests in `state.svelte.test.ts`.
      localStorage.setItem('euchre.pref.autoAdvanceHands', 'false');
    });

    await page.goto('/');
    await expect(page.locator('.scoreboard')).toBeVisible();

    await playHandToCompletion(page);

    const nsValue = await page
      .locator('.scoreboard .cells .cell')
      .first()
      .locator('.value')
      .textContent();
    const ewValue = await page
      .locator('.scoreboard .cells .cell')
      .nth(1)
      .locator('.value')
      .textContent();
    const nsNum = Number((nsValue ?? '0').trim());
    const ewNum = Number((ewValue ?? '0').trim());
    expect(nsNum + ewNum).toBeGreaterThan(0);

    await page.getByRole('button', { name: /next hand/i }).click();
    await expect(
      page.getByRole('heading', { name: /hand complete/i }),
    ).toBeHidden();
  });
});
