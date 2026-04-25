/**
 * Headless self-play tournament harness for AI calibration.
 *
 * Plays N full games using the rules engine as a black box. Per game:
 *   1. `createGame` with a seeded RNG.
 *   2. Loop: ask the bot at the active seat for an Action; apply it.
 *   3. On `hand-complete`, call `advanceToNextHand` and continue.
 *   4. On `game-complete`, record the result.
 *
 * Returns aggregate metrics used by `docs/ai-calibration.md`.
 *
 * Owner: ai-strategy-expert
 */

import type { Action, GameState, RNG, Seat } from '@/lib/types';
import {
  advanceToNextHand,
  applyActionWithRng,
  createGame,
  isLegal,
  legalActions,
} from '@/lib/euchre';
import { seededRng } from '@/lib/euchre';
import type { Bot } from './types';

/** Active seat in a phase that requires a player decision. */
function activeSeat(state: GameState): Seat | null {
  switch (state.phase) {
    case 'bidding-round-1':
    case 'bidding-round-2':
    case 'playing':
      return state.turn;
    case 'dealer-discard':
      return state.dealer;
    default:
      return null;
  }
}

/** Per-game record. Accumulated across the tournament. */
type GameRecord = {
  winner: 'ns' | 'ew';
  finalScore: { ns: number; ew: number };
  hands: number;
  euchres: number;
  aloneCalls: number;
  aloneSuccesses: number;
};

/** Tournament inputs. */
export type TournamentOpts = {
  /** Number of full games to play. */
  readonly gameCount: number;
  /**
   * Bot per seat, in the order [north, east, south, west].
   * Partnerships are NS = north+south, EW = east+west.
   */
  readonly players: readonly [Bot, Bot, Bot, Bot];
  /** RNG used for game-creation, deals, and tie-breaking. */
  readonly rng: RNG;
  /**
   * If true, every action returned by a bot is checked against
   * `legalActions(state, seat)`. Throws on violation. Defaults to false
   * for production speed; tests should set true.
   */
  readonly assertLegal?: boolean;
};

/** Tournament metrics. */
export type TournamentResult = {
  readonly totalGames: number;
  readonly wins: { readonly ns: number; readonly ew: number };
  readonly avgPointsScored: { readonly ns: number; readonly ew: number };
  /** Per-game averages of points conceded by each side. */
  readonly avgPointsConceded: { readonly ns: number; readonly ew: number };
  readonly avgHandsPerGame: number;
  /** Fraction of HANDS in which the makers were euchred. */
  readonly euchreRate: number;
  /** Fraction of HANDS in which someone went alone. */
  readonly alongCallRate: number;
  /**
   * Of hands where someone went alone, the fraction that succeeded
   * (took ≥ 3 tricks). 0 if there were no alone calls.
   */
  readonly aloneSuccessRate: number;
};

/**
 * Run a self-play tournament. Returns aggregate metrics.
 *
 * Defensive guards: each game runs at most 200 hands; no hand may take
 * more than 200 actions. These guards exist to make a runaway loop fail
 * fast rather than hang the test runner.
 */
export async function runTournament(
  opts: TournamentOpts,
): Promise<TournamentResult> {
  const { gameCount, players, rng, assertLegal = false } = opts;
  const records: GameRecord[] = [];

  const seatOrder: readonly Seat[] = ['north', 'east', 'south', 'west'];
  /** Map from seat to its bot. */
  const botFor = (seat: Seat): Bot => {
    const idx = seatOrder.indexOf(seat);
    return players[idx] as Bot;
  };

  for (let g = 0; g < gameCount; g++) {
    let state = createGame({ rng });
    const rec: GameRecord = {
      winner: 'ns',
      finalScore: { ns: 0, ew: 0 },
      hands: 0,
      euchres: 0,
      aloneCalls: 0,
      aloneSuccesses: 0,
    };
    let actionGuard = 0;
    let handGuard = 0;

    while (state.phase !== 'game-complete') {
      actionGuard++;
      if (actionGuard > 5000) {
        throw new Error(
          `runTournament: runaway action loop in game ${g} (phase=${state.phase})`,
        );
      }
      if (state.phase === 'hand-complete') {
        rec.hands++;
        const result = state.result;
        if (result.euchred) rec.euchres++;
        if (result.alone) {
          rec.aloneCalls++;
          if (result.tricksWon.makers >= 3) rec.aloneSuccesses++;
        }
        handGuard++;
        if (handGuard > 200) {
          throw new Error(`runTournament: runaway hand loop in game ${g}`);
        }
        state = advanceToNextHand(state, rng);
        continue;
      }

      const seat = activeSeat(state);
      if (seat === null) {
        throw new Error(
          `runTournament: no active seat in phase ${state.phase}`,
        );
      }
      const bot = botFor(seat);
      const action: Action = await bot.decide(state, seat, rng);
      if (assertLegal && !isLegal(state, action)) {
        const lst = legalActions(state, seat);
        throw new Error(
          `runTournament: bot ${bot.name} returned illegal action ` +
            `${JSON.stringify(action)} in phase=${state.phase} seat=${seat}; ` +
            `legal=${JSON.stringify(lst)}`,
        );
      }
      const r = applyActionWithRng(state, action, rng);
      if (!r.ok) {
        throw new Error(
          `runTournament: applyAction failed: ${r.error.kind} — ${r.error.message}`,
        );
      }
      state = r.value;
    }

    // game-complete — record final outcome.
    if (state.phase === 'game-complete') {
      // Catch the LAST hand (which transitioned directly to game-complete
      // and therefore wasn't observed via hand-complete above).
      // Game-complete carries `hands` array; use its tail.
      if (state.hands.length > 0) {
        const last = state.hands[state.hands.length - 1]!;
        rec.hands++;
        if (last.euchred) rec.euchres++;
        if (last.alone) {
          rec.aloneCalls++;
          if (last.tricksWon.makers >= 3) rec.aloneSuccesses++;
        }
      }
      rec.winner = state.winner;
      rec.finalScore = { ns: state.score.ns, ew: state.score.ew };
      records.push(rec);
    }
  }

  // Aggregate.
  const totalGames = records.length;
  let nsWins = 0;
  let ewWins = 0;
  let nsPoints = 0;
  let ewPoints = 0;
  let totalHands = 0;
  let totalEuchres = 0;
  let totalAloneCalls = 0;
  let totalAloneSuccesses = 0;
  for (const r of records) {
    if (r.winner === 'ns') nsWins++;
    else ewWins++;
    nsPoints += r.finalScore.ns;
    ewPoints += r.finalScore.ew;
    totalHands += r.hands;
    totalEuchres += r.euchres;
    totalAloneCalls += r.aloneCalls;
    totalAloneSuccesses += r.aloneSuccesses;
  }
  const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

  return {
    totalGames,
    wins: { ns: nsWins, ew: ewWins },
    avgPointsScored: {
      ns: safeDiv(nsPoints, totalGames),
      ew: safeDiv(ewPoints, totalGames),
    },
    avgPointsConceded: {
      // From NS perspective, points conceded = points EW scored, etc.
      ns: safeDiv(ewPoints, totalGames),
      ew: safeDiv(nsPoints, totalGames),
    },
    avgHandsPerGame: safeDiv(totalHands, totalGames),
    euchreRate: safeDiv(totalEuchres, totalHands),
    alongCallRate: safeDiv(totalAloneCalls, totalHands),
    aloneSuccessRate: safeDiv(totalAloneSuccesses, totalAloneCalls),
  };
}

/**
 * Convenience: build a tournament with `seededRng(seed)` from a seed
 * integer. Used by tests for reproducibility.
 */
export function tournamentWithSeed(opts: {
  gameCount: number;
  players: readonly [Bot, Bot, Bot, Bot];
  seed: number;
  assertLegal?: boolean;
}): Promise<TournamentResult> {
  const { assertLegal } = opts;
  return runTournament({
    gameCount: opts.gameCount,
    players: opts.players,
    rng: seededRng(opts.seed),
    ...(assertLegal === undefined ? {} : { assertLegal }),
  });
}
