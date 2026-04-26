/**
 * Tests for the reactive state module (`state.svelte.ts`).
 *
 * The pure controller helpers are exercised in `controller.test.ts`. This
 * suite focuses on the wiring that only exists in the reactive module:
 *
 *   - `setVariants` updates the rune AND persists to the typed
 *     `defaultVariants` pref so toggles survive a reload (Bug #5).
 *   - The module init reads the persisted `defaultVariants` and merges it
 *     over the spec defaults (Bug #5).
 *   - The `hand-complete` persist effect calls `saveHand` exactly once per
 *     transition, even after several reactive ticks (Bug #2).
 *
 * Notes on test mechanics:
 *
 *   - Tests using `$effect.root` import the state module **statically**
 *     (top of file). Dynamic-import-after-`vi.resetModules()` produces a
 *     Svelte runtime instance distinct from the test file's, which makes
 *     `$effect.root` fail to register inner effects (`effect_orphan`).
 *
 *   - Init-time variant tests use dynamic import + `vi.resetModules()` to
 *     pick up the freshly-set localStorage pref. They don't touch effects,
 *     so the runtime split doesn't matter.
 *
 * Owner: svelte-component-architect
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { defaults } from '@/lib/types';
import type { GameState, HandResult, Variants } from '@/lib/types';
import { clearPref, getPref, setPref } from '@/lib/storage';

/* ------------------------------------------------------------------ */
/* Hoisted storage mock — applies to the static-import effect test    */
/* below. The hoist runs before module evaluation so the mocked        */
/* `saveHand`/`saveGame`/`updateGame` are observed by `state.svelte`.  */
/* `getPref`/`setPref`/`clearPref` are passed through (real            */
/* localStorage) so the variants tests still see real persistence.     */
/* ------------------------------------------------------------------ */

const storageMocks = vi.hoisted(() => ({
  saveHand: vi.fn().mockResolvedValue(1),
  saveGame: vi.fn().mockResolvedValue(7),
  updateGame: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>(
    '@/lib/storage',
  );
  return {
    ...actual,
    saveHand: storageMocks.saveHand,
    saveGame: storageMocks.saveGame,
    updateGame: storageMocks.updateGame,
  };
});

// Static import for the effect test: must use the same Svelte runtime
// instance as the test file, otherwise `$effect.root` wraps a different
// runtime than the inner `$effect()` calls and `effect_orphan` fires.
import * as stateMod from './state.svelte';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * A canned `hand-complete` `GameState` for driving the persist effect.
 * Only the `phase` and `result` fields are read by the effect — the rest
 * of the shape is filled with valid placeholders to satisfy the type.
 */
function makeHandCompleteState(handId: string): GameState {
  const result: HandResult = {
    handId: handId as HandResult['handId'],
    dealer: 'north',
    maker: 'ns',
    trump: 'spades',
    alone: false,
    tricksWon: { makers: 3, defenders: 2 },
    pointsAwarded: { ns: 1, ew: 0 },
    euchred: false,
    orderedUpInRound: 1,
  };
  return {
    phase: 'hand-complete',
    gameId: 'g-test' as GameState['gameId'],
    variants: defaults,
    dealer: 'north',
    score: { ns: 0, ew: 0 },
    result,
  };
}

/* ------------------------------------------------------------------ */
/* setVariants persists to localStorage                               */
/* ------------------------------------------------------------------ */

describe('setVariants', () => {
  beforeEach(() => {
    clearPref('defaultVariants');
  });

  afterEach(() => {
    clearPref('defaultVariants');
    vi.resetModules();
  });

  it('updates the variants rune AND writes to the defaultVariants pref', async () => {
    vi.resetModules();
    const mod = await import('./state.svelte');
    const next: Variants = { ...defaults, stickTheDealer: false };
    mod.setVariants(next);
    expect(mod.variants.value.stickTheDealer).toBe(false);
    const stored = getPref('defaultVariants');
    expect(stored).toBeDefined();
    expect(stored!.stickTheDealer).toBe(false);
  });

  it('writes a structurally cloneable snapshot (no proxy traps)', async () => {
    vi.resetModules();
    const mod = await import('./state.svelte');
    const next: Variants = { ...defaults, allowGoingAlone: false };
    mod.setVariants(next);
    const stored = getPref('defaultVariants');
    // Round-tripping through structuredClone simulates what Dexie would do
    // and is the canonical guard against `DataCloneError` (Bug #3 family).
    expect(() => structuredClone(stored)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* init-time read of defaultVariants pref                             */
/* ------------------------------------------------------------------ */

describe('state-module init', () => {
  afterEach(() => {
    clearPref('defaultVariants');
    vi.resetModules();
  });

  it('reads the persisted defaultVariants and applies them to the variants rune', async () => {
    const persisted: Variants = {
      ...defaults,
      stickTheDealer: false,
      allowGoingAlone: false,
    };
    setPref('defaultVariants', persisted);

    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.variants.value.stickTheDealer).toBe(false);
    expect(mod.variants.value.allowGoingAlone).toBe(false);
  });

  it('falls back to spec defaults when no pref is stored', async () => {
    clearPref('defaultVariants');
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.variants.value).toEqual(defaults);
  });

  it('merges partial persisted variants over defaults (forwards-compat)', async () => {
    // Simulate an older pref that omits a future field — our `readVariantsPref`
    // merges over `defaults` so missing fields stay defined.
    const partial = {
      stickTheDealer: false,
    } as unknown as Variants;
    setPref('defaultVariants', partial);

    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.variants.value.stickTheDealer).toBe(false);
    expect(mod.variants.value.allowGoingAlone).toBe(defaults.allowGoingAlone);
    expect(mod.variants.value.deckSize).toBe(defaults.deckSize);
  });
});

/* ------------------------------------------------------------------ */
/* persist-hand effect: idempotent under reactive churn               */
/* ------------------------------------------------------------------ */

describe('persist-hand effect (Bug #2)', () => {
  beforeEach(() => {
    storageMocks.saveHand.mockClear();
    storageMocks.saveGame.mockClear();
    storageMocks.updateGame.mockClear();
  });

  it('runs saveHand exactly once per hand-complete transition even after multiple ticks', async () => {
    // Push the bot-loop timeout out far enough that it never fires during
    // the test. The bot loop's `setTimeout` is real (jsdom) and would
    // otherwise advance the game in the background while we're poking the
    // persist effect, polluting the saveHand count.
    stateMod.setBotDelay(5000);

    // Install effects inside a fresh effect-root scope so we can flush
    // reactivity synchronously and tear it down at the end of the test.
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });

    try {
      // Bootstrap a game session so `currentGameDbId` is set (otherwise the
      // persist function early-returns and we'd not be testing the gating).
      await stateMod.startNewGameSession({ difficulty: 'easy' });
      expect(storageMocks.saveGame).toHaveBeenCalledTimes(1);

      // Drive the rune to `hand-complete`. The effect should fire once.
      const handState = makeHandCompleteState('hand-1');
      stateMod.game.value = handState;
      flushSync();
      // Allow the microtask queue to drain so the awaited saveHand runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(storageMocks.saveHand).toHaveBeenCalledTimes(1);

      // Several reactive ticks with the same hand-complete state must NOT
      // re-fire the persist (idempotency guard via `persistedHandIds`).
      stateMod.game.value = { ...handState };
      flushSync();
      await Promise.resolve();
      stateMod.game.value = { ...handState };
      flushSync();
      await Promise.resolve();
      expect(storageMocks.saveHand).toHaveBeenCalledTimes(1);

      // A fresh hand-complete with a new `handId` should fire once more.
      const handState2 = makeHandCompleteState('hand-2');
      stateMod.game.value = handState2;
      flushSync();
      await Promise.resolve();
      await Promise.resolve();
      expect(storageMocks.saveHand).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });
});
