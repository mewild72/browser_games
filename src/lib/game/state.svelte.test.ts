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

/**
 * A `PlayingState` poised for the human (south) to play the 4th card
 * of the FIFTH (and final) trick of the hand. Four tricks are already
 * complete; the 5th has west, north, and east already played. Trump
 * is clubs; led suit is spades.
 *
 * Crucially, the eventual winner of this 5th trick is `east` (K♠ beats
 * 10♠/Q♠/9♠ on the spade-led trick), which is DIFFERENT from
 * `trickLeader` (`west`). That distinction is what makes this a
 * regression fixture: the prior `maybeStartTrickPause` fell back to
 * `prev.trickLeader` for the hand-complete branch, which would set
 * `displayedTrick.value.winner = 'west'` instead of the actual
 * `'east'`. The fix uses `resolveTrick` so the winner is always
 * computed from the four plays under `prev.trump`.
 *
 * After south plays 10♠, the engine resolves the trick (east wins),
 * the 5th completed trick lands NS at 4 tricks and EW at 1. NS scores
 * 1 point under standard scoring, which is below `pointsToWin` (10),
 * so `next.phase === 'hand-complete'` — exactly the case the
 * regression broke.
 */
function makePlayingStateAwaiting4thCardOfFifthTrick(): PlayingState {
  const wLead: TrickPlay = { seat: 'west', card: { suit: 'spades', rank: '9' } };
  const nPlay: TrickPlay = { seat: 'north', card: { suit: 'spades', rank: 'Q' } };
  const ePlay: TrickPlay = { seat: 'east', card: { suit: 'spades', rank: 'K' } };
  const southCard: Card = { suit: 'spades', rank: '10' };
  // Four completed tricks. Winners alternate but fully NS-favoured so
  // the engine doesn't transition to `game-complete` (NS would have
  // 1 point at hand close).
  const fakeTrick = (winner: PlayingState['trickLeader']) => ({
    leader: winner,
    plays: [
      { seat: 'north' as const, card: { suit: 'hearts' as const, rank: '9' as const } },
      { seat: 'east' as const, card: { suit: 'hearts' as const, rank: '10' as const } },
      { seat: 'south' as const, card: { suit: 'hearts' as const, rank: 'J' as const } },
      { seat: 'west' as const, card: { suit: 'hearts' as const, rank: 'Q' as const } },
    ],
    winner,
  });
  return {
    phase: 'playing',
    gameId: 'g-fifth-trick' as PlayingState['gameId'],
    handId: 'h-fifth-trick' as PlayingState['handId'],
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
      fakeTrick('north'),
      fakeTrick('south'),
      fakeTrick('north'),
      fakeTrick('south'),
    ],
    tricksWon: { makers: 4, defenders: 0 },
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

  it('5th-trick pause: displayedTrick is set with the actual winner across the hand-complete transition', () => {
    // Regression guard for the "delay on the last card of the round
    // doesn't seem to be working" report: when the 4th card of trick
    // 5 is played, the engine returns a `hand-complete` state, NOT a
    // `playing` state. The old code derived the displayed `winner`
    // from `next.completedTricks`, which doesn't exist on
    // `hand-complete`, falling back to `prev.trickLeader` — usually
    // the WRONG seat. `<PlayerSeat>` reads `displayedTrick.winner`
    // and only renders the won-trick overlay at that exact seat, so
    // the user perceived the pause as missing.
    vi.useFakeTimers();
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    try {
      stateMod.game.value = makePlayingStateAwaiting4thCardOfFifthTrick();
      flushSync();
      expect(stateMod.displayedTrick.value).toBeNull();

      // Human plays the only legal card — this finishes trick 5 and
      // resolves the hand.
      const ok = stateMod.dispatchUser({
        type: 'playCard',
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      flushSync();
      expect(ok).toBe(true);

      // The state must now be in `hand-complete` AND the displayed
      // trick must be populated with the four plays AND the actual
      // winner (east — the K♠ beats 9♠/Q♠/10♠ on a spade-led trick).
      expect(stateMod.game.value.phase).toBe('hand-complete');
      const dt = stateMod.displayedTrick.value;
      expect(dt).not.toBeNull();
      expect(dt!.plays).toHaveLength(4);
      expect(dt!.plays[3]).toEqual({
        seat: 'south',
        card: { suit: 'spades', rank: '10' },
      });
      // The crucial regression assertion: winner is `east`, not the
      // trick leader `west`.
      expect(dt!.winner).toBe('east');

      // The pause must hold for the configured trick-pause window.
      // Just-under should still hold; just-after should clear.
      vi.advanceTimersByTime(799);
      expect(stateMod.displayedTrick.value).not.toBeNull();
      vi.advanceTimersByTime(2);
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
 * A `PlayingState` where the human (south) is responding to a led
 * trick of spades and holds two cards: one spade and one heart. Trump
 * is clubs so neither card is a bower. The follow-suit rule makes the
 * spade the SOLE legal play even though south has two cards.
 *
 * Used to verify the auto-play effect's generalised "1 legal play"
 * trigger fires when the rules constrain south to a single option,
 * not just when the hand has 1 card.
 */
function makePlayingStateHumanHasOneLegalPlay(): PlayingState {
  const wLead: TrickPlay = { seat: 'west', card: { suit: 'spades', rank: '9' } };
  const nPlay: TrickPlay = { seat: 'north', card: { suit: 'spades', rank: 'Q' } };
  const ePlay: TrickPlay = { seat: 'east', card: { suit: 'spades', rank: 'K' } };
  return {
    phase: 'playing',
    gameId: 'g-auto-legal' as PlayingState['gameId'],
    handId: 'h-auto-legal' as PlayingState['handId'],
    variants: defaults,
    dealer: 'north',
    score: { ns: 0, ew: 0 },
    hands: {
      north: [],
      east: [],
      // Two cards but only the spade follows suit — the heart is
      // illegal while spades is the led suit.
      south: [
        { suit: 'spades', rank: '10' },
        { suit: 'hearts', rank: 'A' },
      ],
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
    completedTricks: [],
    tricksWon: { makers: 0, defenders: 0 },
  };
}

/**
 * A `PlayingState` where the human leads a fresh trick with two
 * different-suit cards and trump is a third suit — every card is a
 * legal play (no led suit when leading), so the auto-play effect must
 * NOT fire. Used as the negative case for the "1 legal play" rule.
 */
function makePlayingStateHumanLeadsTwoLegalPlays(): PlayingState {
  return {
    phase: 'playing',
    gameId: 'g-auto-multi' as PlayingState['gameId'],
    handId: 'h-auto-multi' as PlayingState['handId'],
    variants: defaults,
    dealer: 'north',
    score: { ns: 0, ew: 0 },
    hands: {
      north: [{ suit: 'hearts', rank: 'A' }],
      east: [{ suit: 'diamonds', rank: 'A' }],
      south: [
        { suit: 'spades', rank: 'A' },
        { suit: 'hearts', rank: 'K' },
      ],
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

  it('auto-plays when the human has multiple cards but only one legal follow-suit play', () => {
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        // South holds [spade 10, heart A]; spades was led by west, north
        // and east already followed. Only the spade can be played; the
        // heart is illegal under follow-suit. Auto-play should fire and
        // dispatch the spade.
        stateMod.game.value = makePlayingStateHumanHasOneLegalPlay();
        flushSync();
        setTimeout(() => {
          try {
            flushSync();
            const cur = stateMod.game.value;
            expect(cur.phase).toBe('playing');
            if (cur.phase === 'playing') {
              // South must still have the heart (the spade was auto-played).
              expect(cur.hands.south.length).toBe(1);
              const remaining = cur.hands.south[0]!;
              expect(remaining.suit).toBe('hearts');
              // Trick advanced to a completed state — completedTricks
              // grew, OR the engine transitioned to hand-complete /
              // game-complete. Either way the spade left south's hand.
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

  it('does not auto-play when the human has multiple legal plays', () => {
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        // South leads (no led suit). Two different-suit cards in hand —
        // both legal. Auto-play must NOT fire; the user must choose.
        stateMod.game.value = makePlayingStateHumanLeadsTwoLegalPlays();
        flushSync();
        setTimeout(() => {
          try {
            flushSync();
            const cur = stateMod.game.value;
            expect(cur.phase).toBe('playing');
            if (cur.phase === 'playing') {
              // No card was auto-played — south still holds both.
              expect(cur.hands.south.length).toBe(2);
              // And no card joined the trick from south.
              expect(
                cur.currentTrick.some((p) => p.seat === 'south'),
              ).toBe(false);
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

/* ------------------------------------------------------------------ */
/* Auto-advance hands                                                 */
/* ------------------------------------------------------------------ */

describe('setAutoAdvanceHands', () => {
  beforeEach(() => {
    clearPref('autoAdvanceHands');
  });

  afterEach(() => {
    clearPref('autoAdvanceHands');
    vi.resetModules();
  });

  it('updates the rune AND writes to the autoAdvanceHands pref', async () => {
    vi.resetModules();
    const mod = await import('./state.svelte');
    mod.setAutoAdvanceHands(false);
    expect(mod.autoAdvanceHands.value).toBe(false);
    expect(getPref('autoAdvanceHands')).toBe(false);
    mod.setAutoAdvanceHands(true);
    expect(mod.autoAdvanceHands.value).toBe(true);
    expect(getPref('autoAdvanceHands')).toBe(true);
  });
});

describe('autoAdvanceHands init', () => {
  afterEach(() => {
    clearPref('autoAdvanceHands');
    vi.resetModules();
  });

  it('reads `true` from the persisted pref and applies it to the rune', async () => {
    setPref('autoAdvanceHands', true);
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.autoAdvanceHands.value).toBe(true);
  });

  it('reads `false` from the persisted pref and applies it to the rune', async () => {
    setPref('autoAdvanceHands', false);
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.autoAdvanceHands.value).toBe(false);
  });

  it('defaults to `true` when no pref is stored', async () => {
    clearPref('autoAdvanceHands');
    vi.resetModules();
    const mod = await import('./state.svelte');
    expect(mod.autoAdvanceHands.value).toBe(true);
  });
});

describe('auto-advance hands effect', () => {
  beforeEach(() => {
    storageMocks.saveHand.mockClear();
    storageMocks.saveGame.mockClear();
    storageMocks.updateGame.mockClear();
    // Push the bot loop out so it can't dispatch in the background.
    stateMod.setBotDelay(5000);
    // Default to no trick-pause noise; tests opt into it where needed.
    stateMod.setTrickPause(0);
    stateMod.displayedTrick.value = null;
  });

  afterEach(() => {
    stateMod.displayedTrick.value = null;
    stateMod.setAutoAdvanceHands(true);
  });

  it('auto-advances after the grace period when enabled', () => {
    stateMod.setAutoAdvanceHands(true);
    // Real timers — fake timers race the Svelte $effect re-run cycle in
    // jsdom, mirroring the rationale in the auto-play tests above.
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        // Drop the rune into hand-complete with no displayed trick — the
        // effect's conditions are met so it schedules the auto-advance.
        stateMod.game.value = makeHandCompleteState('auto-h-1');
        flushSync();
        expect(stateMod.game.value.phase).toBe('hand-complete');

        // Wait past the 300 ms grace window plus a buffer so the timer
        // callback has fired and Svelte has reacted to the resulting
        // `game.value = next` write.
        setTimeout(() => {
          try {
            flushSync();
            // `dispatchNextHand` invoked the engine's `nextHand`, which
            // deals a fresh hand and returns a `bidding-round-1` state.
            // The key assertion is that we left `hand-complete`.
            expect(stateMod.game.value.phase).not.toBe('hand-complete');
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 500);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('does NOT auto-advance when the toggle is off', () => {
    stateMod.setAutoAdvanceHands(false);
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        stateMod.game.value = makeHandCompleteState('manual-h-1');
        flushSync();
        setTimeout(() => {
          try {
            flushSync();
            // State is still hand-complete — no auto-dispatch happened.
            expect(stateMod.game.value.phase).toBe('hand-complete');
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 500);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('does NOT auto-advance from `game-complete` even when the toggle is on', () => {
    stateMod.setAutoAdvanceHands(true);
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        const gameComplete: GameState = {
          phase: 'game-complete',
          gameId: 'g-over' as GameState['gameId'],
          variants: defaults,
          dealer: 'north',
          score: { ns: 10, ew: 6 },
          winner: 'ns',
          hands: [],
        };
        stateMod.game.value = gameComplete;
        flushSync();
        setTimeout(() => {
          try {
            flushSync();
            // No transition — game-complete is sticky for the
            // auto-advance effect (it explicitly checks
            // `phase === 'hand-complete'`).
            expect(stateMod.game.value.phase).toBe('game-complete');
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 500);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('with `trickPauseMs === 0`, fires after the grace window with no pause to wait for', () => {
    stateMod.setAutoAdvanceHands(true);
    stateMod.setTrickPause(0);
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        // displayedTrick stays null throughout because pause is 0.
        stateMod.game.value = makeHandCompleteState('zero-pause-h-1');
        flushSync();
        expect(stateMod.displayedTrick.value).toBeNull();
        setTimeout(() => {
          try {
            flushSync();
            // Even without a trick pause to wait for, the auto-advance
            // effect fires after the grace window.
            expect(stateMod.game.value.phase).not.toBe('hand-complete');
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 500);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });

  it('cancels a pending auto-advance when the toggle is flipped off mid-grace', () => {
    stateMod.setAutoAdvanceHands(true);
    const cleanup = $effect.root(() => {
      stateMod.installEffects();
      return () => undefined;
    });
    return new Promise<void>((resolve, reject) => {
      try {
        stateMod.game.value = makeHandCompleteState('cancel-h-1');
        flushSync();
        // Halfway through the grace window, disable auto-advance.
        setTimeout(() => {
          stateMod.setAutoAdvanceHands(false);
          flushSync();
        }, 100);
        setTimeout(() => {
          try {
            flushSync();
            // The cancelled timer must NOT have advanced the hand.
            expect(stateMod.game.value.phase).toBe('hand-complete');
            cleanup();
            resolve();
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 600);
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
