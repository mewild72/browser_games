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

import type {
  Action,
  GameState,
  HandResult,
  Seat,
  Variants,
} from '@/lib/types';
import { defaults } from '@/lib/types';
import { defaultRng } from '@/lib/euchre';
import type { Bot, Difficulty } from '@/lib/ai';
import {
  getPref,
  recordFromResult,
  saveGame,
  saveHand,
  setPref,
  updateGame,
} from '@/lib/storage';
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
const DEFAULT_BOT_DELAY_MS = 600;

/** Pref key for bot delay (not in the typed PrefsMap; cast at the boundary). */
const BOT_DELAY_KEY = 'botDelayMs';

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
  return startNewGame({ difficulty: readDifficultyPref() });
}

function readDifficultyPref(): Difficulty {
  const pref = getPref('lastDifficulty');
  return pref ?? 'easy';
}

function readBotDelayPref(): number {
  // Bot delay is not in the PrefsMap (it's runtime UX, not user data).
  // Read it from raw localStorage with the same namespace prefix used by prefs.ts.
  // Safe to access — module is browser-only.
  if (typeof localStorage === 'undefined') return DEFAULT_BOT_DELAY_MS;
  const raw = localStorage.getItem(`euchre.pref.${BOT_DELAY_KEY}`);
  if (raw === null) return DEFAULT_BOT_DELAY_MS;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 5000) return DEFAULT_BOT_DELAY_MS;
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

/** Current game state. Subscribers re-render when this rune updates. */
export const game = $state<{ value: GameState }>({ value: buildInitialState() });

/** Current difficulty. Persists to localStorage on change. */
export const difficulty = $state<{ value: Difficulty }>({ value: readDifficultyPref() });

/** Current variants in play. */
export const variants = $state<{ value: Variants }>({ value: defaults });

/** Bot delay in ms between bot decisions. */
export const botDelayMs = $state<{ value: number }>({ value: readBotDelayPref() });

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
 * can attribute log lines.
 */
export function logAction(text: string): void {
  actionLog.value = [
    ...actionLog.value,
    { id: nextLogId++, text, timestamp: Date.now() },
  ];
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
 * Setup the reactive effects. Called once from `App.svelte` so the
 * effects are owned by a component scope (Svelte requires `$effect` to
 * run inside a reactive context).
 */
export function installEffects(): void {
  // Bot loop: when the current seat is a bot, sleep then dispatch.
  $effect(() => {
    const state = game.value;
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

  // Persist newly-completed hands.
  $effect(() => {
    const state = game.value;
    if (state.phase !== 'hand-complete') return;
    const result = state.result;
    void persistHandIfNew(result);
  });

  // Persist game completion.
  $effect(() => {
    const state = game.value;
    if (state.phase !== 'game-complete') return;
    if (persistedGameComplete.value) return;
    void persistGameComplete(state.score, state.winner);
  });

  // Reactive log lines based on phase changes.
  $effect(() => {
    const state = game.value;
    if (state.phase === 'hand-complete') {
      const r = state.result;
      const makerSide = partnershipLabel(r.maker);
      const defenderSide = partnershipLabel(r.maker === 'ns' ? 'ew' : 'ns');
      const verdict = r.euchred
        ? `${capitalizeWord(makerSide)} (makers) was euchred. ${capitalizeWord(defenderSide)} score ${r.pointsAwarded[r.maker === 'ns' ? 'ew' : 'ns']} points`
        : `${capitalizeWord(makerSide)} take ${r.tricksWon.makers} tricks and score ${r.pointsAwarded[r.maker]} points`;
      logAction(
        `End of hand. ${verdict}. Score: ${state.score.ns} – ${state.score.ew}.`,
      );
    } else if (state.phase === 'game-complete') {
      const winner = partnershipLabel(state.winner);
      logAction(
        `Game over. ${capitalizeWord(winner)} win ${state.score.ns} – ${state.score.ew}.`,
      );
    }
  });
}

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
    const record = recordFromResult(currentGameDbId.value, handIndex.value, result);
    await saveHand(record);
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
    await updateGame(currentGameDbId.value, {
      endedAt,
      // durationMs requires the original startedAt; we read it back via getGame
      // would add an extra round-trip; track startedAt locally instead.
      durationMs: gameStartedAt === null ? null : endedAt - gameStartedAt,
      winner,
      finalScore,
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
  game.value = state;
  handIndex.value = 0;
  persistedHandIds.value = new Set<string>();
  persistedGameComplete.value = false;
  actionLog.value = [];
  gameStartedAt = Date.now();
  botEpoch++;

  logAction(`New ${newDifficulty} game started. Dealer: ${state.dealer}.`);

  // Persist the new game record.
  try {
    const id = await saveGame({
      engineGameId: state.gameId,
      gameKind: 'euchre',
      difficulty: newDifficulty,
      variants: newVariants,
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
  const clamped = Math.max(0, Math.min(5000, Math.floor(ms)));
  botDelayMs.value = clamped;
  writeBotDelayPref(clamped);
}

/** Update the variants used by the next game. (Does not change the live game.) */
export function setVariants(next: Variants): void {
  variants.value = next;
}

/** Re-export so components can ask "is it the human's turn?" without re-importing. */
export { HUMAN_SEAT } from './controller';
