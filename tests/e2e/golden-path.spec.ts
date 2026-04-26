import { expect, test } from '@playwright/test';
import { playHandToCompletion } from './_helpers';

/**
 * Golden-path test — boot the app, race through bidding by pressing
 * "Pass" whenever the human is asked, let the bots play (with 0 ms
 * delay) until the hand completes, then advance with "Next hand".
 *
 * STATUS: fixme — uncovers a production bug.
 *
 * When a hand reaches `hand-complete`, the app raises Svelte's
 * `effect_update_depth_exceeded` runtime error. The `$effect` at
 * `src/lib/game/state.svelte.ts:186` (persist newly-completed hand)
 * loops indefinitely, which freezes the reactive system. After this
 * fires, no further $state updates render — clicking "Next hand" or
 * "Stats" no longer opens or transitions anything.
 *
 * Confirmed via direct browser repro:
 *   localStorage.setItem('euchre.pref.botDelayMs', '0');
 *   // play a hand to hand-complete
 *   // pageerror: effect_update_depth_exceeded
 *   //   at logAction (state.svelte.ts:109)
 *   //   at $effect (state.svelte.ts:186)
 *
 * Owner of the fix: svelte-component-architect (the effect needs an
 * `untrack(() => …)` around the read-then-write inside the persist
 * path), with help from indexeddb-expert if the persist function's
 * own state writes are involved.
 *
 * Once fixed, remove `.fixme` and the test should pass as written.
 *
 * Owner: svelte-qa-validator
 */

test.setTimeout(90_000);

test.describe('Golden path', () => {
  test.fixme(
    'finish a hand and advance to the next',
    async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('euchre.pref.botDelayMs', '0');
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

      await page
        .getByRole('button', { name: /next hand/i })
        .evaluate((el) => (el as HTMLButtonElement).click());
      await expect(
        page.getByRole('heading', { name: /hand complete/i }),
      ).toBeHidden();
    },
  );
});
