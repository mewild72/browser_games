/**
 * Reactive game state module.
 *
 * Owns the in-memory `GameState` for the current play session, drives the
 * bot loop via `$effect`, and persists hand and game results to IndexedDB
 * as the engine reaches them. Components subscribe to the exported runes
 * and dispatch through the exported action functions.
 *
 * Owner: svelte-component-architect
 */

import { untrack } from 'svelte';
import type {
  Action,
  CompletedTrick,
  GameState,
  HandResult,
  Seat,
  Variants,
} from '@/lib/types';
import { defaults } from '@/lib/types';
import { defaultRng, legalActions } from '@/lib/euchre';
import type { Bot, Difficulty } from '@/lib/ai';
import {
  getPref,
  recordFromResult,
  saveGame,
  saveHand,
  setPref,
  updateGame,
} from '@/lib/storage';
import { DEFAULT_CARD_BACK_ID } from '@/lib/cards/art';
import {
  HUMAN_SEAT,
  currentBotSeat,
  dispatchBot,
  dispatchUserAction,
  makeBots,
  nextHand,
  startNewGame,
} from './controller';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default delay (ms) between bot actions so the human can read the table. */
const DEFAULT_BOT_DELAY_MS = 1000;

/** Default pause (ms) after a trick completes so the player can see the 4th card. */
const DEFAULT_TRICK_PAUSE_MS = 5000;

/** Hard cap on both bot delay and trick pause range. */
const MAX_DELAY_MS = 5000;

/** Pref key for bot delay (not in the typed PrefsMap; cast at the boundary). */
const BOT_DELAY_KEY = 'botDelayMs';

/** Pref key for trick-display pause. Typed in PrefsMap. */
const TRICK_PAUSE_KEY = 'trickPauseMs';

/** Pref key for the auto-advance-hands toggle. Typed in PrefsMap. */
const AUTO_ADVANCE_HANDS_KEY = 'autoAdvanceHands';

/**
 * Default for {@link autoAdvanceHands}. When `true`, the state module
 * dispatches the next hand automatically a short grace period after the
 * post-trick pause clears.
 */
const DEFAULT_AUTO_ADVANCE_HANDS = true;

/**
 * Grace period (ms) between the post-trick pause clearing and the
 * automatic `advanceToNextHand` dispatch. Gives the user a beat to read
 * the final score before the next hand is dealt. The {@link
 * HandCompletePanel} stays visible and clickable during this window —
 * clicking "Next hand" advances instantly.
 */
const AUTO_ADVANCE_GRACE_MS = 300;

/* ------------------------------------------------------------------ */
/* Action log                                                         */
/* ------------------------------------------------------------------ */

/** One entry in the chronological action log. */
export type LogEntry = {
  readonly id: number;
  readonly text: string;
  readonly timestamp: number;
};

/* ------------------------------------------------------------------ */
/* Reactive state                                                     */
/* ------------------------------------------------------------------ */

/**
 * Initial game state. Built lazily on first read so import-time side
 * effects (`createGame` consumes RNG) don't fire in test environments
 * that import the module without using it.
 */
function buildInitialState(): GameState {
  return startNewGame({
    difficulty: readDifficultyPref(),
    variants: readVariantsPref(),
  });
}

function readDifficultyPref(): Difficulty {
  const pref = getPref('lastDifficulty');
  return pref ?? 'easy';
}

/**
 * Read the persisted variant flags and merge them over the spec defaults.
 *
 * Merging (rather than replacing wholesale) ensures that when new variant
 * fields are added to `Variants` in the future, an older persisted record
 * does not leave a field `undefined` — the spec default fills the gap.
 */
function readVariantsPref(): Variants {
  const pref = getPref('defaultVariants');
  if (pref === undefined) return defaults;
  return { ...defaults, ...pref };
}

function readBotDelayPref(): number {
  // Bot delay is not in the PrefsMap (it's runtime UX, not user data).
  // Read it from raw localStorage with the same namespace prefix used by prefs.ts.
  // Safe to access — module is browser-only.
  if (typeof localStorage === 'undefined') return DEFAULT_BOT_DELAY_MS;
  const raw = localStorage.getItem(`euchre.pref.${BOT_DELAY_KEY}`);
  if (raw === null) return DEFAULT_BOT_DELAY_MS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > MAX_DELAY_MS) return DEFAULT_BOT_DELAY_MS;
  return parsed;
}

function writeBotDelayPref(value: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`euchre.pref.${BOT_DELAY_KEY}`, String(value));
  } catch {
    // ignore — UI prefs are best-effort
  }
}

/**
 * Read the trick-display pause preference. Uses the typed
 * `getPref('trickPauseMs')` so the value goes through the same JSON
 * round-trip as other prefs, and falls back to `DEFAULT_TRICK_PAUSE_MS`
 * when absent or out of range.
 */
function readTrickPausePref(): number {
  const stored = getPref(TRICK_PAUSE_KEY);
  if (stored === undefined) return DEFAULT_TRICK_PAUSE_MS;
  if (
    typeof stored !== 'number' ||
    Number.isNaN(stored) ||
    stored < 0 ||
    stored > MAX_DELAY_MS
  ) {
    return DEFAULT_TRICK_PAUSE_MS;
  }
  return stored;
}

/**
 * Read the auto-advance-hands preference. Uses the typed
 * `getPref('autoAdvanceHands')` so the value goes through the same JSON
 * round-trip as other prefs, and falls back to {@link
 * DEFAULT_AUTO_ADVANCE_HANDS} (true) when absent or malformed.
 */
function readAutoAdvanceHandsPref(): boolean {
  const stored = getPref(AUTO_ADVANCE_HANDS_KEY);
  if (stored === undefined) return DEFAULT_AUTO_ADVANCE_HANDS;
  if (typeof stored !== 'boolean') return DEFAULT_AUTO_ADVANCE_HANDS;
  return stored;
}

/** Current game state. Subscribers re-render when this rune updates. */
export const game = $state<{ value: GameState }>({ value: buildInitialState() });

/** Current difficulty. Persists to localStorage on change. */
export const difficulty = $state<{ value: Difficulty }>({ value: readDifficultyPref() });

/** Current variants in play. Initialised from the persisted preference. */
export const variants = $state<{ value: Variants }>({ value: readVariantsPref() });

/** Bot delay in ms between bot decisions. */
export const botDelayMs = $state<{ value: number }>({ value: readBotDelayPref() });

/**
 * How long the just-completed trick lingers on the table before the
 * next trick begins. 0 = legacy behaviour (no pause).
 */
export const trickPauseMs = $state<{ value: number }>({ value: readTrickPausePref() });

/**
 * Whether the next hand is dispatched automatically after the
 * post-trick pause clears on a `hand-complete` state. The
 * {@link HandCompletePanel} remains visible and clickable so the user
 * can advance instantly; this rune merely provides the fallback.
 *
 * `'game-complete'` is intentionally NOT auto-advanced — the user
 * starts a new game explicitly so they can read the final result.
 */
export const autoAdvanceHands = $state<{ value: boolean }>({
  value: readAutoAdvanceHandsPref(),
});

/**
 * The trick the table should display while we hold for `trickPauseMs`.
 * Non-null only during the post-trick pause; `null` otherwise (the
 * in-progress `state.currentTrick` is the source of truth instead).
 *
 * Components read `displayedTrick.value` and render its plays when
 * present; otherwise they fall back to `state.currentTrick`.
 */
export const displayedTrick = $state<{ value: CompletedTrick | null }>({ value: null });

/** setTimeout handle for the active trick pause, so it can be cancelled. */
let trickPauseTimer: number | null = null;

function clearTrickPauseTimer(): void {
  if (trickPauseTimer !== null) {
    clearTimeout(trickPauseTimer);
    trickPauseTimer = null;
  }
}

/**
 * If `prev → next` represents a trick resolving (the action played the
 * 4th card of a trick), freeze the just-completed trick on the
 * displayed table for `trickPauseMs` ms. The bot loop reads
 * `displayedTrick.value` and won't dispatch while it's set, so the
 * table actually pauses.
 *
 * Two cases produce a resolved trick:
 *   1. The 4th card of trick #1–#4 — engine returns a `playing` state
 *      with `completedTricks` grown by one and `currentTrick` reset.
 *   2. The 4th card of trick #5 — engine returns `hand-complete` (or
 *      `game-complete` if the score crossed). The just-completed
 *      trick is *not* on the next state in this case.
 *
 * In both cases we construct the `CompletedTrick` to display from
 * `prev.currentTrick` (the three already-played plays) plus the action
 * itself (the 4th play). The displayed `winner` is a best-effort —
 * sourced from `next.completedTricks` when available, otherwise from
 * `next.trickLeader` (whose seat the engine rotated to in case 1) —
 * but the visual rendering doesn't surface the winner directly, so
 * the placeholder is fine for the hand-complete case.
 */
function maybeStartTrickPause(
  prev: GameState,
  next: GameState,
  action: Action,
): void {
  if (prev.phase !== 'playing') return;
  if (prev.currentTrick.length !== 3) return;
  if (action.type !== 'playCard') return;

  const fourthPlay = { seat: action.seat, card: action.card };
  const plays = [...prev.currentTrick, fourthPlay];

  // Resolve the winner where we can; otherwise fall back to the
  // trickLeader from the prev state (visual-only placeholder).
  let winner = prev.trickLeader;
  if (next.phase === 'playing' && next.completedTricks.length > prev.completedTricks.length) {
    const ct = next.completedTricks[next.completedTricks.length - 1];
    if (ct !== undefined) winner = ct.winner;
  }

  const justCompleted: CompletedTrick = {
    leader: prev.trickLeader,
    plays,
    winner,
  };

  const pause = trickPauseMs.value;
  if (pause <= 0) {
    // Pref disables the pause entirely.
    displayedTrick.value = null;
    return;
  }

  clearTrickPauseTimer();
  displayedTrick.value = justCompleted;
  trickPauseTimer = window.setTimeout(() => {
    trickPauseTimer = null;
    displayedTrick.value = null;
  }, pause);
}

/**
 * Active card-back id. Consumed by `<Card>` for face-down rendering.
 *
 * Initialised from the persisted `cardBack` UI pref and falls back to the
 * manifest's default (currently `'classic-blue'`) when no pref is stored.
 * Updated via `setCardBack`, which mirrors the change to localStorage so
 * the choice survives a reload.
 */
export const selectedBackId = $state<{ value: string }>({
  value: getPref('cardBack') ?? DEFAULT_CARD_BACK_ID,
});

/** Bots keyed by seat. The human seat is intentionally absent. */
const bots = $state<{ value: Partial<Record<Seat, Bot>> }>({
  value: makeBots(readDifficultyPref()),
});

/**
 * IndexedDB id for the current game record. Set when `startNewGameSession`
 * inserts the row; updated to `null` when no game is active (e.g., before
 * first start in tests).
 */
const currentGameDbId = $state<{ value: number | null }>({ value: null });

/**
 * Hand index within the current game (0 = first hand). Used for
 * `HandRecord.index`.
 */
const handIndex = $state<{ value: number }>({ value: 0 });

/** Tracks which hand result ids have already been persisted so the effect can be idempotent. */
const persistedHandIds = $state<{ value: Set<string> }>({ value: new Set<string>() });

/** Whether the game record's final-state row update has been applied. */
const persistedGameComplete = $state<{ value: boolean }>({ value: false });

/** Action log entries in chronological order. */
export const actionLog = $state<{ value: LogEntry[] }>({ value: [] });

let nextLogId = 1;

/**
 * Append a line to the action log.
 *
 * Exported so component-side helpers (e.g., "you played the J of spades")
 * can attribute log lines. The read-and-write pattern below is wrapped in
 * `untrack` so callers running inside a `$effect` don't accidentally bind
 * that effect to `actionLog` — without this, every effect that emits a
 * log line would re-fire whenever any other line was appended (Bug #2).
 */
export function logAction(text: string): void {
  const entry = { id: nextLogId++, text, timestamp: Date.now() };
  // Wrap in `untrack` so callers running inside a `$effect` don't tie
  // that effect to the action log. The Svelte 5 self-invalidation hook
  // (see `runtime.js` "untracked_writes") still propagates self-DIRTY
  // through the calling effect when the write is observed during the
  // CLEAN phase — this is fine in practice because the calling effects
  // (`installEffects` log effect, action describers) are gated on
  // phase changes, not on the action log itself.
  untrack(() => {
    actionLog.value = [...actionLog.value, entry];
  });
}

/* ------------------------------------------------------------------ */
/* Effects: bot loop and persistence                                  */
/* ------------------------------------------------------------------ */

/**
 * Track the latest bot decision in flight so a `startNewGame` mid-flight
 * doesn't dispatch a stale action against the new state.
 */
let botEpoch = 0;

/**
 * Tracks the human-auto-play timer separately from the bot loop so it
 * can be cancelled cleanly when the game advances out of the
 * "one-card-left" condition (e.g., a `startNewGame` lands mid-pause).
 */
let humanAutoPlayEpoch = 0;

/**
 * Tracks the auto-advance-hands timer so a `startNewGameSession` (or a
 * subsequent state change) can cancel an in-flight auto-advance before
 * it dispatches against a stale `hand-complete` state. Bumped whenever
 * the auto-advance effect schedules a new timer or the session resets.
 */
let autoAdvanceEpoch = 0;

/**
 * The currently-scheduled auto-advance `setTimeout` handle, or `null`
 * when none is pending. Held outside the effect so
 * `clearAutoAdvanceTimer` can cancel it from `startNewGameSession`
 * without waiting for the effect cleanup to run.
 */
let autoAdvanceTimer: number | null = null;

function clearAutoAdvanceTimer(): void {
  if (autoAdvanceTimer !== null) {
    window.clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  autoAdvanceEpoch++;
}


/**
 * Setup the reactive effects. Called once from `App.svelte` so the
 * effects are owned by a component scope (Svelte requires `$effect` to
 * run inside a reactive context).
 */
export function installEffects(): void {
  // Bot loop: when the current seat is a bot, sleep then dispatch.
  //
  // Gating on `displayedTrick.value` is what holds the post-trick
  // pause: while a just-completed trick is on display, the loop skips
  // dispatching so the next trick's first card doesn't appear on top
  // of the previous trick's four cards. When `displayedTrick` clears
  // (timer fires, or pref is 0), this effect re-runs and dispatches
  // the next bot action normally.
  $effect(() => {
    const state = game.value;
    if (displayedTrick.value !== null) return;

    const seat = currentBotSeat(state, bots.value);
    if (seat === null) return;

    botEpoch++;
    const myEpoch = botEpoch;
    const delay = botDelayMs.value;
    const timeout = window.setTimeout(() => {
      void runBotTurn(myEpoch);
    }, delay);
    return () => window.clearTimeout(timeout);
  });

  // Auto-play whenever the human has exactly one legal play.
  //
  // Generalises the prior "1 card in hand" rule: any time south is on
  // the play and the rules engine reports a single legal `playCard`
  // action — e.g. only one card of the led suit (must follow), or
  // genuinely one card left in hand — there is no decision to make, so
  // we auto-dispatch the lone option after a brief delay (the highlight
  // gives the player a moment to read the card). Gated by the
  // trick-display pause to avoid playing on top of the just-completed
  // trick. The explicit `phase === 'playing'` check is kept so the
  // effect cannot fire during `dealer-discard` (where `legalActions`
  // returns `discardKitty` actions, which are correctly filtered out
  // below as a defence in depth).
  $effect(() => {
    const state = game.value;
    if (displayedTrick.value !== null) return;
    if (state.phase !== 'playing') return;
    if (state.turn !== HUMAN_SEAT) return;
    const playOptions = legalActions(state, HUMAN_SEAT).filter(
      (a) => a.type === 'playCard',
    );
    if (playOptions.length !== 1) return;
    const card = playOptions[0]!.card;

    humanAutoPlayEpoch++;
    const myEpoch = humanAutoPlayEpoch;
    // Brief pause so the player can see the card highlighted before it
    // flies onto the trick. Cap at 500 ms — even a long bot delay
    // shouldn't make the auto-play feel sluggish.
    const delay = Math.min(500, botDelayMs.value);
    const timeout = window.setTimeout(() => {
      if (myEpoch !== humanAutoPlayEpoch) return;
      // Re-check the guards at fire time — state may have moved since
      // the timer was scheduled (e.g., a bot dispatched first).
      const cur = game.value;
      if (cur.phase !== 'playing') return;
      if (cur.turn !== HUMAN_SEAT) return;
      const curOptions = legalActions(cur, HUMAN_SEAT).filter(
        (a) => a.type === 'playCard',
      );
      if (curOptions.length !== 1) return;
      if (displayedTrick.value !== null) return;
      dispatchUser({ type: 'playCard', seat: HUMAN_SEAT, card: curOptions[0]!.card });
    }, delay);
    return () => window.clearTimeout(timeout);
  });

  // Auto-advance hands.
  //
  // After the 5th trick resolves to `hand-complete`, wait for the
  // post-trick display pause to clear (it freezes the final played card
  // on the table for `trickPauseMs`) and then dispatch the next hand
  // automatically. The HandCompletePanel stays visible and clickable
  // throughout the grace window so the user can advance instantly.
  //
  // Trigger conditions, all required:
  //   - `autoAdvanceHands.value === true` (settings toggle)
  //   - `displayedTrick.value === null` (no trick frozen on the table)
  //   - `game.value.phase === 'hand-complete'`
  //
  // `'game-complete'` is intentionally excluded — at game over we want
  // the user to read the final result and start a new game explicitly.
  //
  // Edge case: when `trickPauseMs === 0`, no pause is taken, so the
  // 5th trick resolution lands the state directly in `hand-complete`
  // with `displayedTrick.value` already null. The conditions above
  // still hold, so the effect schedules the auto-advance after the
  // {@link AUTO_ADVANCE_GRACE_MS} grace period.
  //
  // The cleanup return cancels any timer that hasn't fired yet — any
  // upstream reactive dependency change (e.g., `startNewGameSession`
  // resetting `game.value`, the user clicking "Next hand" manually) is
  // therefore guaranteed to abort an in-flight auto-advance even before
  // the explicit `clearAutoAdvanceTimer` call in `startNewGameSession`.
  $effect(() => {
    const state = game.value;
    const dt = displayedTrick.value;
    const enabled = autoAdvanceHands.value;
    if (!enabled) return;
    if (dt !== null) return;
    if (state.phase !== 'hand-complete') return;
    autoAdvanceEpoch++;
    const myEpoch = autoAdvanceEpoch;
    const handle = window.setTimeout(() => {
      autoAdvanceTimer = null;
      if (myEpoch !== autoAdvanceEpoch) return;
      // Re-check guards at fire time — state may have moved since the
      // timer was scheduled (manual click, new game, etc.).
      if (!autoAdvanceHands.value) return;
      if (displayedTrick.value !== null) return;
      if (game.value.phase !== 'hand-complete') return;
      dispatchNextHand();
    }, AUTO_ADVANCE_GRACE_MS);
    autoAdvanceTimer = handle;
    return () => {
      window.clearTimeout(handle);
      if (autoAdvanceTimer === handle) autoAdvanceTimer = null;
    };
  });

  // Persist newly-completed hands.
  //
  // The effect's only reactive dependency is `game.value` (and, for the
  // hand-complete branch, `game.value.phase` / `game.value.result`). Every
  // other read — counters, sets, ids — is wrapped in `untrack` so that
  // writes performed inside `persistHandIfNew` (which it must do, both to
  // mark the hand persisted and to bump the index) never re-trigger this
  // effect. Without `untrack`, the synchronous read of
  // `persistedHandIds.value` would register a dependency that the
  // subsequent write tears down, causing `effect_update_depth_exceeded`.
  $effect(() => {
    const state = game.value;
    if (state.phase !== 'hand-complete') return;
    const result = state.result;
    untrack(() => {
      void persistHandIfNew(result);
    });
  });

  // Persist game completion.
  $effect(() => {
    const state = game.value;
    if (state.phase !== 'game-complete') return;
    const score = state.score;
    const winner = state.winner;
    untrack(() => {
      if (persistedGameComplete.value) return;
      void persistGameComplete(score, winner);
    });
  });

  // Reactive log lines based on phase changes.
  //
  // Gated by `lastAnnouncedHandId` / `lastAnnouncedGameComplete` so the
  // effect emits one log line per *transition*, not per re-render. The
  // log writes themselves are wrapped in `untrack` (inside `logAction`),
  // but Svelte 5's self-invalidation hook can still re-fire a CLEAN
  // effect when it observes a tracked write — see Bug #2. The guard
  // here makes the work idempotent regardless of how many times the
  // effect runs.
  $effect(() => {
    const state = game.value;
    if (state.phase === 'hand-complete') {
      const handId = state.result.handId;
      untrack(() => {
        if (lastAnnouncedHandId === handId) return;
        lastAnnouncedHandId = handId;
        const r = state.result;
        const makerSide = partnershipLabel(r.maker);
        const defenderSide = partnershipLabel(r.maker === 'ns' ? 'ew' : 'ns');
        const verdict = r.euchred
          ? `${capitalizeWord(makerSide)} (makers) was euchred. ${capitalizeWord(defenderSide)} score ${r.pointsAwarded[r.maker === 'ns' ? 'ew' : 'ns']} points`
          : `${capitalizeWord(makerSide)} take ${r.tricksWon.makers} tricks and score ${r.pointsAwarded[r.maker]} points`;
        logAction(
          `End of hand. ${verdict}. Score: ${state.score.ns} – ${state.score.ew}.`,
        );
      });
    } else if (state.phase === 'game-complete') {
      untrack(() => {
        if (lastAnnouncedGameComplete) return;
        lastAnnouncedGameComplete = true;
        const winner = partnershipLabel(state.winner);
        logAction(
          `Game over. ${capitalizeWord(winner)} win ${state.score.ns} – ${state.score.ew}.`,
        );
      });
    }
  });
}

/** Last hand-complete handId we've announced, to keep the log idempotent. */
let lastAnnouncedHandId: HandResult['handId'] | null = null;
/** Have we already announced game completion for the current game? */
let lastAnnouncedGameComplete = false;

async function runBotTurn(epoch: number): Promise<void> {
  // Drop the dispatch if a newer epoch has been queued.
  if (epoch !== botEpoch) return;
  const state = game.value;
  const seat = currentBotSeat(state, bots.value);
  if (seat === null) return;
  const result = await dispatchBot(state, bots.value);
  if (epoch !== botEpoch) return; // user changed games during the await
  if (result === null) return;
  if (!result.ok) {
    logAction(`Bot error (${seat}): ${result.reason}`);
    return;
  }
  describeBotAction(result.prevState, result.action, seat);
  // Schedule the trick-display pause BEFORE swapping in the new state
  // so the bot-loop $effect sees `displayedTrick.value !== null` on the
  // next reactive tick and skips dispatching the next action.
  maybeStartTrickPause(result.prevState, result.state, result.action);
  game.value = result.state;
  // Announce post-action state transitions (trick winners, phase changes,
  // turn updates, score deltas). Pass both states so transitions can be
  // detected by diffing.
  announceTransitions(result.prevState, result.state);
}

/**
 * Render an action into a human-readable announcement.
 *
 * Used for both bot actions (called from `runBotTurn`) and post-hoc
 * narration. The tone is deliberately conversational so the live region
 * is pleasant to listen to.
 */
function describeBotAction(prev: GameState, action: Action, seat: Seat): void {
  const seatName = capitalizeSeat(seat);
  switch (action.type) {
    case 'pass':
      logAction(`${seatName} passes.`);
      break;
    case 'orderUp': {
      // The turned card's suit was the trump being ordered up. Only valid
      // in bidding-round-1.
      if (prev.phase === 'bidding-round-1') {
        logAction(
          `${seatName} orders up ${prev.turnedCard.suit}${action.alone ? ' (alone)' : ''}.`,
        );
      } else {
        logAction(`${seatName} orders up${action.alone ? ' (alone)' : ''}.`);
      }
      break;
    }
    case 'callTrump':
      logAction(
        `${seatName} calls ${action.suit}${action.alone ? ' (alone)' : ''}.`,
      );
      break;
    case 'discardKitty':
      // The dealer's discard is private — don't reveal the card a bot
      // discarded. Just announce that it happened.
      logAction(`${seatName} discards a card.`);
      break;
    case 'playCard':
      logAction(
        `${seatName} plays the ${action.card.rank} of ${action.card.suit}.`,
      );
      break;
  }
}

function capitalizeSeat(seat: Seat): string {
  return capitalizeWord(seat);
}

function capitalizeWord(word: string): string {
  if (word.length === 0) return word;
  return word[0]!.toUpperCase() + word.slice(1);
}

function partnershipLabel(p: 'ns' | 'ew'): string {
  return p === 'ns' ? 'your team' : 'the opponents';
}

/**
 * Announce screen-reader-relevant transitions between two states.
 *
 * Called after every successful action (bot or human) so trick winners,
 * phase changes, score updates, and turn changes are conveyed to AT
 * users via the polite live region. Sighted users see the same
 * messages in the action log.
 */
function announceTransitions(prev: GameState, next: GameState): void {
  // Trick complete: completedTricks grew by one.
  if (
    prev.phase === 'playing' &&
    next.phase === 'playing' &&
    next.completedTricks.length > prev.completedTricks.length
  ) {
    const winningTrick = next.completedTricks[next.completedTricks.length - 1];
    if (winningTrick !== undefined) {
      logAction(
        `${capitalizeSeat(winningTrick.winner)} wins the trick (makers ${next.tricksWon.makers}, defenders ${next.tricksWon.defenders}).`,
      );
    }
  }

  // Phase transitions worth narrating.
  if (prev.phase !== next.phase) {
    if (prev.phase === 'bidding-round-1' && next.phase === 'bidding-round-2') {
      logAction(`Bidding round 2 begins. The ${prev.turnedCard.suit} is rejected.`);
    } else if (
      (prev.phase === 'bidding-round-1' ||
        prev.phase === 'bidding-round-2' ||
        prev.phase === 'dealer-discard') &&
      next.phase === 'playing'
    ) {
      logAction(
        `Trump is ${next.trump}. ${capitalizeSeat(next.makerSeat)} (${partnershipLabel(next.maker)}) is the maker${next.alone ? ' going alone' : ''}.`,
      );
    }
    // hand-complete and game-complete are already announced by the
    // existing $effect that watches game.value (kept for redundancy when
    // a hand ends as a side-effect of e.g. user "Next hand" dispatch).
  }

  // Whose-turn announcement: only when the active seat changes within an
  // ongoing phase. (Phase transitions above cover the cross-phase case.)
  const prevTurn = activeSeat(prev);
  const nextTurn = activeSeat(next);
  if (
    prev.phase === next.phase &&
    prevTurn !== null &&
    nextTurn !== null &&
    prevTurn !== nextTurn
  ) {
    // Be quiet during bidding rounds — every bot pass would otherwise
    // produce two log lines (the action + the turn change). Restrict
    // turn callouts to the playing phase, which is where they matter
    // most for screen-reader users tracking the rotation.
    if (next.phase === 'playing') {
      logAction(`${capitalizeSeat(nextTurn)}'s turn.`);
    }
  }
}

/** Identify the seat whose decision is awaited in a state, or null. */
function activeSeat(s: GameState): Seat | null {
  switch (s.phase) {
    case 'bidding-round-1':
    case 'bidding-round-2':
    case 'playing':
      return s.turn;
    case 'dealer-discard':
      return s.dealer;
    default:
      return null;
  }
}

async function persistHandIfNew(result: HandResult): Promise<void> {
  if (currentGameDbId.value === null) return;
  if (persistedHandIds.value.has(result.handId)) return;
  // Mark immediately to make the effect idempotent under multiple firings.
  persistedHandIds.value = new Set([...persistedHandIds.value, result.handId]);
  try {
    // `result` may carry references to engine state held inside `$state`
    // proxies. Snapshot before handing the record to Dexie, whose
    // `structuredClone` cannot serialise Svelte proxies (Bug #3).
    const record = recordFromResult(
      currentGameDbId.value,
      handIndex.value,
      result,
    );
    await saveHand($state.snapshot(record));
    handIndex.value++;
  } catch (err) {
    logAction(`Failed to persist hand: ${(err as Error).message}`);
  }
}

async function persistGameComplete(
  finalScore: { readonly ns: number; readonly ew: number },
  winner: 'ns' | 'ew',
): Promise<void> {
  if (currentGameDbId.value === null) return;
  if (persistedGameComplete.value) return;
  persistedGameComplete.value = true;
  try {
    const endedAt = Date.now();
    // Snapshot reactive sub-objects (`finalScore`) so Dexie's structured
    // clone never sees a Svelte proxy. Primitives need no snapshot.
    await updateGame(currentGameDbId.value, {
      endedAt,
      durationMs: gameStartedAt === null ? null : endedAt - gameStartedAt,
      winner,
      finalScore: $state.snapshot(finalScore),
    });
  } catch (err) {
    logAction(`Failed to persist game completion: ${(err as Error).message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Public actions                                                     */
/* ------------------------------------------------------------------ */

/** Track game start time for `durationMs`. */
let gameStartedAt: number | null = null;

/**
 * Start a fresh game: mint state, persist a `GameRecord`, swap bots in.
 *
 * Returns the new state (also exposed via the `game` rune).
 */
export async function startNewGameSession(opts?: {
  readonly difficulty?: Difficulty;
  readonly variants?: Variants;
}): Promise<GameState> {
  const newDifficulty = opts?.difficulty ?? difficulty.value;
  const newVariants = opts?.variants ?? variants.value;

  difficulty.value = newDifficulty;
  variants.value = newVariants;
  setPref('lastDifficulty', newDifficulty);
  bots.value = makeBots(newDifficulty);

  const state = startNewGame({ difficulty: newDifficulty, variants: newVariants });
  // Cancel any in-flight trick-display pause so a fresh hand doesn't
  // start with a leftover trick frozen on the table.
  clearTrickPauseTimer();
  displayedTrick.value = null;
  // Cancel any pending auto-advance — a new session must not dispatch
  // a stale `dispatchNextHand` against the freshly seeded state.
  clearAutoAdvanceTimer();
  game.value = state;
  handIndex.value = 0;
  persistedHandIds.value = new Set<string>();
  persistedGameComplete.value = false;
  lastAnnouncedHandId = null;
  lastAnnouncedGameComplete = false;
  actionLog.value = [];
  gameStartedAt = Date.now();
  botEpoch++;
  humanAutoPlayEpoch++;

  logAction(`New ${newDifficulty} game started. Dealer: ${state.dealer}.`);

  // Persist the new game record. Snapshot the reactive sub-objects
  // (`variants`) before passing to storage — Dexie uses `structuredClone`
  // internally and cannot clone Svelte `$state` proxies, which would
  // throw `DataCloneError` (Bug #3).
  try {
    const id = await saveGame({
      engineGameId: state.gameId,
      gameKind: 'euchre',
      difficulty: newDifficulty,
      variants: $state.snapshot(newVariants) as Variants,
      deckCount: 1,
      startedAt: gameStartedAt,
      endedAt: null,
      durationMs: null,
      winner: null,
      finalScore: null,
    });
    currentGameDbId.value = id;
  } catch (err) {
    logAction(`Failed to persist new game: ${(err as Error).message}`);
    currentGameDbId.value = null;
  }

  return state;
}

/**
 * Apply a user-originated action. Returns `true` on success; on failure
 * the reason is appended to the action log and the state is unchanged.
 */
export function dispatchUser(action: Action): boolean {
  const prev = game.value;
  const result = dispatchUserAction(prev, action);
  if (!result.ok) {
    logAction(`Illegal action: ${result.reason}`);
    return false;
  }
  describeUserAction(prev, action);
  // Schedule the trick-display pause BEFORE swapping in the new state
  // so the bot-loop $effect sees the gate closed on its next tick.
  maybeStartTrickPause(prev, result.state, action);
  game.value = result.state;
  // Mirror the bot path: surface trick-winner / phase / turn transitions.
  announceTransitions(prev, result.state);
  return true;
}

function describeUserAction(prev: GameState, action: Action): void {
  switch (action.type) {
    case 'pass':
      logAction(`You passed.`);
      break;
    case 'orderUp':
      logAction(`You ordered up${action.alone ? ' (alone)' : ''}.`);
      break;
    case 'callTrump':
      logAction(`You called ${action.suit}${action.alone ? ' (alone)' : ''}.`);
      break;
    case 'discardKitty':
      logAction(`You discarded ${action.card.rank}${suitGlyph(action.card.suit)}.`);
      break;
    case 'playCard':
      logAction(`You played ${action.card.rank}${suitGlyph(action.card.suit)}.`);
      break;
  }
  void prev;
}

function suitGlyph(suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'): string {
  switch (suit) {
    case 'clubs':
      return '\u2663';
    case 'diamonds':
      return '\u2666';
    case 'hearts':
      return '\u2665';
    case 'spades':
      return '\u2660';
  }
}

/**
 * Move from `hand-complete` to a freshly dealt next hand. No-op if the
 * current state is not in `hand-complete`.
 */
export function dispatchNextHand(): void {
  const state = game.value;
  if (state.phase !== 'hand-complete') return;
  const next = nextHand(state, defaultRng());
  game.value = next;
  if (next.phase === 'bidding-round-1') {
    logAction(
      `Next hand dealt. Dealer: ${capitalizeSeat(next.dealer)}. Turned card: ${next.turnedCard.rank} of ${next.turnedCard.suit}.`,
    );
  } else {
    logAction(`Next hand dealt.`);
  }
}

/**
 * Update the AI difficulty at runtime. Affects the next decision the
 * bot loop makes; the in-flight game continues with the new bots.
 */
export function setDifficulty(d: Difficulty): void {
  difficulty.value = d;
  setPref('lastDifficulty', d);
  bots.value = makeBots(d);
}

/**
 * Update the bot decision delay. Persists across sessions.
 */
export function setBotDelay(ms: number): void {
  const clamped = Math.max(0, Math.min(MAX_DELAY_MS, Math.floor(ms)));
  botDelayMs.value = clamped;
  writeBotDelayPref(clamped);
}

/**
 * Update the post-trick display pause. Persists across sessions via
 * the typed `trickPauseMs` pref.
 */
export function setTrickPause(ms: number): void {
  const clamped = Math.max(0, Math.min(MAX_DELAY_MS, Math.floor(ms)));
  trickPauseMs.value = clamped;
  setPref(TRICK_PAUSE_KEY, clamped);
}

/**
 * Update the auto-advance-hands toggle. When `false`, a freshly-completed
 * hand stays in `hand-complete` until the user clicks "Next hand"
 * (legacy behaviour). When `true`, the auto-advance effect schedules
 * `dispatchNextHand` after the post-trick pause clears plus a brief
 * grace period.
 *
 * Setting this to `false` cancels any in-flight auto-advance timer so
 * a hand mid-grace doesn't tick over the moment the user toggles off.
 */
export function setAutoAdvanceHands(next: boolean): void {
  autoAdvanceHands.value = next;
  setPref(AUTO_ADVANCE_HANDS_KEY, next);
  if (!next) clearAutoAdvanceTimer();
}

/**
 * Update the active card-back. Persists to localStorage so the choice
 * survives a reload. The id is taken on faith — `<Card>` falls back to
 * its placeholder back-pattern when the id resolves to no bundled URL,
 * so a stale preference (e.g. a back removed between releases) degrades
 * gracefully rather than crashing.
 */
export function setCardBack(id: string): void {
  selectedBackId.value = id;
  setPref('cardBack', id);
}

/**
 * Update the variants used by the next game. Does not change the live
 * game's variants — the engine snapshots them at game start.
 *
 * Persists the new variants to localStorage via the typed `defaultVariants`
 * pref so toggles survive a reload. We snapshot before persisting because
 * `next` may itself be a Svelte `$state` proxy from the SettingsModal —
 * `structuredClone` (used internally by some storage paths) cannot clone
 * proxies, and `JSON.stringify` over a proxy is also unreliable.
 */
export function setVariants(next: Variants): void {
  variants.value = next;
  setPref('defaultVariants', $state.snapshot(next) as Variants);
}

/** Re-export so components can ask "is it the human's turn?" without re-importing. */
export { HUMAN_SEAT } from './controller';
