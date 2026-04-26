/**
 * Pure game-loop controller.
 *
 * This module contains side-effect-free helpers that the reactive state
 * module (`state.svelte.ts`) and tests can call. Keeping the logic here
 * pure means it can be unit tested without spinning up Svelte runes.
 *
 * Owner: svelte-component-architect
 */

import type {
  Action,
  GameState,
  HandCompleteState,
  RNG,
  Seat,
  Variants,
} from '@/lib/types';
import { defaults } from '@/lib/types';
import {
  advanceToNextHand,
  applyActionWithRng,
  createGame,
  defaultRng,
  isLegal,
} from '@/lib/euchre';
import type { Bot, Difficulty } from '@/lib/ai';
import { easyBot, hardBot, mediumBot } from '@/lib/ai';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * The seat the human always occupies. The MVP hard-codes south.
 *
 * Hard-coded per spec — UI puts the human at the bottom of the table.
 * Typed as the literal 'south' so callers can `Exclude` against it.
 */
export type HumanSeat = 'south';
export const HUMAN_SEAT: HumanSeat = 'south';
export type BotSeat = Exclude<Seat, HumanSeat>;

/**
 * Options accepted by `startNewGame`.
 */
export type StartNewGameOpts = {
  readonly difficulty: Difficulty;
  readonly variants?: Variants;
  readonly rng?: RNG;
};

/**
 * Outcome of `dispatchUserAction` — separates legality failures (caller
 * surfaces a UI error) from successful state advances.
 */
export type DispatchOutcome =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/* ------------------------------------------------------------------ */
/* Bot factories                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build the seat→Bot map for a given difficulty.
 *
 * The human seat is omitted; only the three AI seats receive bots.
 *
 * Hard tier currently rejects on `decide`; this factory still returns
 * the stub so callers can log it loudly. Production UI surfaces "Hard"
 * as disabled until IS-MCTS lands.
 */
export function makeBots(difficulty: Difficulty): Readonly<Record<BotSeat, Bot>> {
  const factory = pickBotFactory(difficulty);
  return {
    north: factory(`${capitalize(difficulty)} N (partner)`),
    east: factory(`${capitalize(difficulty)} E`),
    west: factory(`${capitalize(difficulty)} W`),
  };
}

function pickBotFactory(difficulty: Difficulty): (name?: string) => Bot {
  switch (difficulty) {
    case 'easy':
      return easyBot;
    case 'medium':
      return mediumBot;
    case 'hard':
      return hardBot;
  }
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value[0]!.toUpperCase() + value.slice(1);
}

/* ------------------------------------------------------------------ */
/* startNewGame                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build a fresh `GameState` for a new game. Variants default to project
 * MVP defaults; RNG defaults to the production `Math.random` wrapper.
 */
export function startNewGame(opts: StartNewGameOpts): GameState {
  const variants = opts.variants ?? defaults;
  const rng = opts.rng ?? defaultRng();
  return createGame({ variants, rng });
}

/* ------------------------------------------------------------------ */
/* dispatchUserAction                                                 */
/* ------------------------------------------------------------------ */

/**
 * Attempt a user-originated action. Validates seat ownership (the action
 * must originate from the human seat) and engine legality, then advances.
 *
 * Returns a tagged outcome so the caller can branch without try/catch.
 */
export function dispatchUserAction(
  state: GameState,
  action: Action,
  rng: RNG = defaultRng(),
): DispatchOutcome {
  if (action.seat !== HUMAN_SEAT) {
    return { ok: false, reason: `Action seat ${action.seat} is not the human seat (${HUMAN_SEAT}).` };
  }
  if (!isLegal(state, action)) {
    return { ok: false, reason: 'Action is not legal in the current state.' };
  }
  const result = applyActionWithRng(state, action, rng);
  if (!result.ok) {
    return { ok: false, reason: result.error.message };
  }
  return { ok: true, state: result.value };
}

/* ------------------------------------------------------------------ */
/* dispatchBot                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ask a bot to decide and apply its action. Pure — accepts the bot, the
 * state, and the RNG; returns the resulting state or `null` if the bot
 * has no work to do (state phase not actionable, or the human's turn).
 *
 * The state-machine layer wires this with `$effect` and a delay so the
 * human sees the bot acting.
 */
export async function dispatchBot(
  state: GameState,
  bots: Readonly<Partial<Record<Seat, Bot>>>,
  rng: RNG = defaultRng(),
): Promise<DispatchOutcome | null> {
  const seat = currentBotSeat(state, bots);
  if (seat === null) return null;
  const bot = bots[seat];
  if (bot === undefined) return null;
  const action = await bot.decide(state, seat, rng);
  if (action.seat !== seat) {
    return { ok: false, reason: `Bot for ${seat} returned action with seat ${action.seat}.` };
  }
  if (!isLegal(state, action)) {
    return { ok: false, reason: `Bot for ${seat} chose an illegal action.` };
  }
  const next = applyActionWithRng(state, action, rng);
  if (!next.ok) {
    return { ok: false, reason: next.error.message };
  }
  return { ok: true, state: next.value };
}

/**
 * Identify the seat that owes a bot decision right now, or `null` if the
 * current state is not waiting on a bot (it's the human's turn, or the
 * phase has no actor — `hand-complete`, `game-complete`, `dealing`).
 */
export function currentBotSeat(
  state: GameState,
  bots: Readonly<Partial<Record<Seat, Bot>>>,
): Seat | null {
  switch (state.phase) {
    case 'dealing':
    case 'hand-complete':
    case 'game-complete':
      return null;
    case 'dealer-discard':
      return bots[state.dealer] !== undefined ? state.dealer : null;
    case 'bidding-round-1':
    case 'bidding-round-2':
    case 'playing': {
      const turn = state.turn;
      return bots[turn] !== undefined ? turn : null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* nextHand                                                           */
/* ------------------------------------------------------------------ */

/**
 * Wrap `advanceToNextHand` so callers don't have to import the engine
 * directly. Accepts only `HandCompleteState` to make the precondition
 * type-checked.
 */
export function nextHand(
  state: HandCompleteState,
  rng: RNG = defaultRng(),
): GameState {
  return advanceToNextHand(state, rng);
}
