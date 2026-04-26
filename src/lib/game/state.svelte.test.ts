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
import type {
  Card,
  GameState,
  HandResult,
  PlayingState,
  TrickPlay,
  Variants,
} from '@/lib/types';
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

/**
 * A `PlayingState` poised for the human (south) to play the 4th card
 * of a trick. West led, then north and east followed suit; south's
 * hand has only one card (the spade 10) so it's the only legal play.
 * Trump = clubs so spades is the led suit and the 10S follows suit
 * normally.
 *
 * One trick is already complete, so the engine will return another
 * `playing` state on the 4th-card play (rather than transitioning to
 * `hand-complete`). That keeps the post-pause assertion clean: when
 * `displayedTrick` clears, the human's seat owns the next lead and
 * the bot-loop won't fire.
 */
function makePlayingStateAwaiting4thCard(): PlayingState {
  const wLead: TrickPlay = { seat: 'west', card: { suit: 'spades', rank: '9' } };
  const nPlay: TrickPlay = { seat: 'north', card: { suit: 'spades', rank: 'Q' } };
  const ePlay: TrickPlay = { seat: 'east', card: { suit: 'spades', rank: 'K' } };
  const southCard: Card = { suit: 'spades', rank: '10' };
  return {
    phase: 'playing',
    gameId: 'g-trick-pause' as PlayingState['gameId'],
    handId: 'h-trick-pause' as PlayingState['handId'],
    variants: defaults,
    dealer: 'north',
    score: { ns: 0, ew: 0 },
    hands: {
      north: [],
      east: [],
      south: [southCard],
      west: [],
    },
    trump: 'clubs',
    maker: 'ns',
    makerSeat: 'north',
    alone: false,
    sittingOut: null,
    orderedUpInRound: 1,
    trickLeader: 'west',
    turn: 'south',
    currentTrick: [wLead, nPlay, ePlay],
    completedTricks: [
      {
        leader: 'north',
        plays: [
          { seat: 'north', card: { suit: 'hearts', rank: '9' } },
          { seat: 'east', card: { suit: 'hearts', rank: '10' } },
          { seat: 'south', card: { suit: 'hearts', rank: 'J' } },
          { seat: 'west', card: { suit: 'hearts', rank: 'Q' } },
        ],
        winner: 'west',
      },
    ],
    tricksWon: { makers: 0, defenders: 1 },
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

/* ------------------------------------------------------------------ */
/* setTrickPause persists to localStorage                             */
/* ------------------------------------------------------------------ */

describe('setTrickPause', () => {
  beforeEach(() => {
    clearPref('trickPauseMs');
  });

  afterEach(() => {
    clearPref('trickPauseMs');
    vi.resetModules();
  });

  it('updates the trickPauseMs rune AND writes the trickPauseMs pref', async () => {
    vi.resetModules();
    const mod = await import('./state.svelte');
    mod.setTrickPause(2500);
    expect(mod.trickPauseMs.value).toBe(2500);
    expect(getPref('trickPauseMs')).toBe(2500);
  });

  it('clamps negative inputs to 0 and excessive inputs to 5000', async () => {
    vi.resetModules();
    const mod = await import('./state.svelte');
    mod.setTrickPause(-100);
    expect(mod.trickPauseMs.value).toBe(0);
    mod.setTrickPause(99_999);
    expect(mod.trickPauseMs.value).toBe(5000);
  });
});

/* ------------------------------------------------------------------ */
/* trickPauseMs init reads from prefs                                 */
/* ------------------------------------------------------------------ */

describe('trickPauseMs init', () => {
  afterEach(() => {
    clearPref('trickPauseMs');
    vi.resetModules();
  });

  it('reads the persisted trickPauseMs and applies it to the rune', async () => {
    setPref('trickPauseMs', 1500);
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.trickPauseMs.value).toBe(1500);
  });

  it('falls back to the default (5000 ms) when no pref is stored', async () => {
    clearPref('trickPauseMs');
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.trickPauseMs.value).toBe(5000);
  });
});

/* ------------------------------------------------------------------ */
/* Trick-display pause: dispatchUser path                             */
/* ------------------------------------------------------------------ */

describe('trick-display pause', () => {
  beforeEach(() => {
    storageMocks.saveHand.mockClear();
    storageMocks.saveGame.mockClear();
    storageMocks.updateGame.mockClear();
    // Ensure a deterministic pause for the test.
    stateMod.setTrickPause(800);
    // Push the bot-loop timeout out so it never wakes during the test.
    stateMod.setBotDelay(5000);
    // Cancel any leftover displayed trick from a previous test.
    stateMod.displayedTrick.value = null;
  });

  afterEach(() => {
    stateMod.displayedTrick.value = null;
    vi.useRealTimers();
  });

  it('after the 4th card is played, displayedTrick is set with the four plays', () => {
    vi.useFakeTimers();
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    try {
      stateMod.game.value = makePlayingStateAwaiting4thCard();
      flushSync();
      // Sanity: not yet paused.
      expect(stateMod.displayedTrick.value).toBeNull();

      // Human plays the only legal card.
      const ok = stateMod.dispatchUser({
        type: 'playCard',
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      flushSync();
      expect(ok).toBe(true);

      // The trick-pause helper should now hold the just-completed
      // four-play trick on the display rune.
      const dt = stateMod.displayedTrick.value;
      expect(dt).not.toBeNull();
      expect(dt!.plays).toHaveLength(4);
      // 4th card is the human's play.
      expect(dt!.plays[3]).toEqual({
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
    } finally {
      cleanup();
    }
  });

  it('clears displayedTrick after trickPauseMs elapses (timer-driven)', () => {
    vi.useFakeTimers();
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    try {
      stateMod.game.value = makePlayingStateAwaiting4thCard();
      flushSync();
      stateMod.dispatchUser({
        type: 'playCard',
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      flushSync();
      expect(stateMod.displayedTrick.value).not.toBeNull();

      // Advance just under the pause: still frozen.
      vi.advanceTimersByTime(799);
      expect(stateMod.displayedTrick.value).not.toBeNull();

      // Cross the threshold: the timer fires and clears the rune.
      vi.advanceTimersByTime(2);
      expect(stateMod.displayedTrick.value).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('with trickPauseMs === 0, no pause is taken (legacy behaviour)', () => {
    stateMod.setTrickPause(0);
    vi.useFakeTimers();
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    try {
      stateMod.game.value = makePlayingStateAwaiting4thCard();
      flushSync();
      stateMod.dispatchUser({
        type: 'playCard',
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      flushSync();
      // Pause is 0 ms — displayedTrick must remain null so the next
      // trick renders immediately.
      expect(stateMod.displayedTrick.value).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('startNewGameSession cancels a pending trick-pause timer', async () => {
    vi.useFakeTimers();
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    try {
      stateMod.game.value = makePlayingStateAwaiting4thCard();
      flushSync();
      stateMod.dispatchUser({
        type: 'playCard',
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      flushSync();
      expect(stateMod.displayedTrick.value).not.toBeNull();

      // Switch to real timers so startNewGameSession's awaited
      // saveGame promise can resolve, then synchronously assert that
      // the pause was cleared (it is — setting displayedTrick = null
      // is synchronous inside startNewGameSession).
      vi.useRealTimers();
      await stateMod.startNewGameSession({ difficulty: 'easy' });
      expect(stateMod.displayedTrick.value).toBeNull();
    } finally {
      cleanup();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Auto-play last card                                                */
/* ------------------------------------------------------------------ */

/**
 * A `PlayingState` where it's the human's turn to LEAD a fresh trick
 * (not respond to one) with a single card in hand. The bot loop won't
 * fire because all four hands sit at zero/one cards; only the auto-play
 * effect should produce an action.
 */
function makePlayingStateHumanLeadsOneCardLeft(): PlayingState {
  const southCard: Card = { suit: 'spades', rank: 'A' };
  return {
    phase: 'playing',
    gameId: 'g-auto-play' as PlayingState['gameId'],
    handId: 'h-auto-play' as PlayingState['handId'],
    variants: defaults,
    dealer: 'north',
    score: { ns: 0, ew: 0 },
    hands: {
      north: [{ suit: 'hearts', rank: 'A' }],
      east: [{ suit: 'diamonds', rank: 'A' }],
      south: [southCard],
      west: [{ suit: 'spades', rank: 'K' }],
    },
    trump: 'clubs',
    maker: 'ns',
    makerSeat: 'north',
    alone: false,
    sittingOut: null,
    orderedUpInRound: 1,
    trickLeader: 'south',
    turn: 'south',
    currentTrick: [],
    completedTricks: [],
    tricksWon: { makers: 0, defenders: 0 },
  };
}

describe('auto-play last card', () => {
  beforeEach(() => {
    storageMocks.saveHand.mockClear();
    storageMocks.saveGame.mockClear();
    storageMocks.updateGame.mockClear();
    // Push the bot-loop timeout out so it never wakes during the test.
    stateMod.setBotDelay(5000);
    // Disable trick pause to avoid orthogonal timer interactions.
    stateMod.setTrickPause(0);
    stateMod.displayedTrick.value = null;
  });

  afterEach(() => {
    stateMod.displayedTrick.value = null;
  });

  it('dispatches playCard automatically when human has one card and it is their turn', () => {
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    // Use real timers here so the actual setTimeout fires, then await
    // its 500 ms delay. Fake timers in conjunction with Svelte's $effect
    // re-run cycle race in a way that leaves the effect un-fired in
    // jsdom; using real timers reliably exercises the path.
    return new Promise<void>((resolve, reject) => {
      try {
        stateMod.game.value = makePlayingStateHumanLeadsOneCardLeft();
        flushSync();
        // Wait a bit longer than the auto-play delay (500 ms cap).
        setTimeout(() => {
          try {
            flushSync();
            const cur = stateMod.game.value;
            expect(cur.phase).toBe('playing');
            if (cur.phase === 'playing') {
              expect(cur.hands.south.length).toBe(0);
            }
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 700);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('does not auto-play while a trick-display pause is active', () => {
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        // Manually freeze a displayed trick so the auto-play guard kicks in.
        stateMod.displayedTrick.value = {
          leader: 'west',
          plays: [
            { seat: 'west', card: { suit: 'hearts', rank: '9' } },
            { seat: 'north', card: { suit: 'hearts', rank: '10' } },
            { seat: 'east', card: { suit: 'hearts', rank: 'J' } },
            { seat: 'south', card: { suit: 'hearts', rank: 'Q' } },
          ],
          winner: 'south',
        };
        stateMod.game.value = makePlayingStateHumanLeadsOneCardLeft();
        flushSync();
        // Wait past the would-be auto-play threshold. The displayedTrick
        // guard should suppress the dispatch entirely.
        setTimeout(() => {
          try {
            flushSync();
            const cur = stateMod.game.value;
            expect(cur.phase).toBe('playing');
            if (cur.phase === 'playing') {
              expect(cur.hands.south.length).toBe(1);
            }
            stateMod.displayedTrick.value = null;
            cleanup();
            resolve();
          } catch (err) {
            stateMod.displayedTrick.value = null;
            cleanup();
            reject(err);
          }
        }, 700);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('does nothing when the human has more than one card', () => {
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        const base = makePlayingStateHumanLeadsOneCardLeft();
        stateMod.game.value = {
          ...base,
          hands: {
            ...base.hands,
            south: [
              { suit: 'spades', rank: 'A' },
              { suit: 'spades', rank: 'K' },
            ],
          },
        };
        flushSync();
        setTimeout(() => {
          try {
            flushSync();
            const cur = stateMod.game.value;
            expect(cur.phase).toBe('playing');
            if (cur.phase === 'playing') {
              // The human still has two cards — no auto-play.
              expect(cur.hands.south.length).toBe(2);
            }
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 700);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });
});

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
