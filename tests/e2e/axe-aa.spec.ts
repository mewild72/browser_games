import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * axe-core regression — every user-facing state passes WCAG 2.x A and
 * AA. Fulfils the recommendation in `docs/accessibility-audit.md` to
 * add automated axe-core checks.
 *
 * Owner: svelte-qa-validator
 */

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

test.describe('axe-core WCAG AA', () => {
  test('initial game view has no AA violations', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('euchre.pref.botDelayMs', '0');
    });
    await page.goto('/');

    // Settle into a steady state so the scan reflects what the user
    // sees on first paint.
    await page.locator('.scoreboard').waitFor();
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('Settings modal has no AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Settings$/ }).click();
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator('h2', { hasText: /^Settings$/ }) });
    await expect(dialog).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);

    await page.keyboard.press('Escape');
  });

  test('Stats modal has no AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Stats$/ }).click();
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator('h2', { hasText: /^Stats$/ }) });
    await expect(dialog).toBeVisible();
    // Wait for any "Loading…" status to clear.
    await expect(dialog.locator('p', { hasText: /^Loading/i })).toBeHidden({
      timeout: 5_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);

    await page.keyboard.press('Escape');
  });

  test('KeyboardHelp overlay has no AA violations', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').click();
    await page.keyboard.press('Shift+?');
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator('h2', { hasText: /^Keyboard shortcuts$/ }) });
    await expect(dialog).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations, formatViolations(results.violations)).toEqual([]);

    await page.keyboard.press('Escape');
  });
});

/**
 * Pretty-print axe violations so failure messages identify *which*
 * SC fails on *which* selector. Without this the assertion just shows
 * `[ … ]` and the engineer has to dig into the HTML report.
 */
function formatViolations(
  violations: readonly {
    id: string;
    help: string;
    nodes: readonly { target: readonly (string | string[])[] }[];
  }[],
): string {
  if (violations.length === 0) return 'no violations';
  return violations
    .map((v) => {
      const targets = v.nodes
        .map((n) => n.target.flat().join(' '))
        .join(', ');
      return `${v.id} — ${v.help} [${targets}]`;
    })
    .join('\n');
}
