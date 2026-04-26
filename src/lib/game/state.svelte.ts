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
      const sideLabel = r.maker === 'ns' ? 'NS' : 'EW';
      const verdict = r.euchred
        ? `${sideLabel} (makers) was euchred — defenders +${r.pointsAwarded[r.maker === 'ns' ? 'ew' : 'ns']}`
        : `${sideLabel} won ${r.tricksWon.makers} tricks — +${r.pointsAwarded[r.maker]}`;
      logAction(`Hand complete: ${verdict}. Score NS ${state.score.ns} – EW ${state.score.ew}.`);
    } else if (state.phase === 'game-complete') {
      logAction(`Game complete. Winner: ${state.winner.toUpperCase()} (${state.score.ns}–${state.score.ew}).`);
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
  describeAction(state, seat);
  game.value = result.state;
}

function describeAction(prev: GameState, seat: Seat): void {
  // Best-effort log entry. The state has already advanced by the time we
  // log, but we have access to the seat that just acted; produce a coarse
  // description from the prior phase.
  switch (prev.phase) {
    case 'bidding-round-1':
    case 'bidding-round-2':
      logAction(`${seat} acted in ${prev.phase}.`);
      break;
    case 'dealer-discard':
      logAction(`${seat} discarded.`);
      break;
    case 'playing':
      logAction(`${seat} played a card.`);
      break;
    default:
      break;
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
  const result = dispatchUserAction(game.value, action);
  if (!result.ok) {
    logAction(`Illegal action: ${result.reason}`);
    return false;
  }
  describeUserAction(game.value, action);
  game.value = result.state;
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
  logAction(`Next hand dealt. Dealer: ${next.phase === 'bidding-round-1' ? next.dealer : '?'}.`);
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
