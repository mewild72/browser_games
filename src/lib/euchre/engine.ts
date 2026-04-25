/**
 * Euchre rules engine — the public state machine.
 *
 * `createGame` builds an initial GameState with a fresh deal.
 * `applyAction(state, action)` validates and advances the state.
 * `legalActions(state, seat)` enumerates legal actions for a seat.
 * `isLegal(state, action)` checks a single action without applying it.
 *
 * All randomness flows through the injected RNG. All transitions return a
 * `Result` — illegal actions never throw. Throws are reserved for
 * impossible states (programmer errors).
 *
 * Owner: game-rules-engine
 */

import type {
  Action,
  BiddingRound1State,
  BiddingRound2State,
  Card,
  DealerDiscardState,
  GameState,
  HandCompleteState,
  HandResult,
  PlayingState,
  Result,
  RNG,
  RulesError,
  Seat,
  Suit,
  Variants,
} from '@/lib/types';
import {
  defaults,
  leftOfSeat,
  partnerOfSeat,
  partnershipOfSeat,
  seatsClockwise,
} from '@/lib/types';
import { defaultRng } from './rng';
import { dealHand } from './deal';
import { assertVariantsValid } from './variants';
import {
  applyBiddingRound1,
  applyBiddingRound2,
  openingLeader,
} from './bidding';
import {
  isPlayLegal,
  ledSuitOfTrick,
  legalPlays,
  resolveTrick,
} from './play';
import {
  pointsAwardedFromOutcome,
  scoreHand,
  gameWinner,
  isGameOver,
} from './score';
import {
  err,
  indexOfCard,
  nextGameId,
  nextHandId,
  ok,
  removeCard,
  ruleError,
} from './internal';

/* ------------------------------------------------------------------ */
/* createGame                                                         */
/* ------------------------------------------------------------------ */

/**
 * Options for `createGame`.
 */
export type CreateGameOpts = {
  readonly variants?: Variants;
  readonly rng?: RNG;
  readonly firstDealer?: Seat;
};

/**
 * Build a fresh game and deal the first hand.
 *
 * If `firstDealer` is omitted, one of the four seats is chosen via the
 * RNG. The deal itself also consumes the RNG.
 */
export function createGame(opts: CreateGameOpts = {}): GameState {
  const variants = opts.variants ?? defaults;
  assertVariantsValid(variants);
  const rng = opts.rng ?? defaultRng();

  let firstDealer: Seat;
  if (opts.firstDealer !== undefined) {
    firstDealer = opts.firstDealer;
  } else {
    const idx = Math.floor(rng.next() * seatsClockwise.length);
    // idx is in [0, 4); seatsClockwise has 4 entries.
    firstDealer = seatsClockwise[idx] as Seat;
  }

  return startNewHand({
    variants,
    rng,
    dealer: firstDealer,
    score: { ns: 0, ew: 0 },
    gameId: nextGameId(),
  });
}

/**
 * Internal: deal a fresh hand and return the resulting BiddingRound1State.
 */
function startNewHand(args: {
  variants: Variants;
  rng: RNG;
  dealer: Seat;
  score: { ns: number; ew: number };
  gameId: GameState['gameId'];
}): BiddingRound1State {
  const { variants, rng, dealer, score, gameId } = args;
  const { hands, kitty, turnedCard } = dealHand(rng, dealer);
  return {
    phase: 'bidding-round-1',
    gameId,
    handId: nextHandId(),
    variants,
    dealer,
    score,
    hands,
    turnedCard,
    kitty,
    turn: leftOfSeat[dealer],
    passes: 0,
  };
}

/* ------------------------------------------------------------------ */
/* applyAction                                                        */
/* ------------------------------------------------------------------ */

/**
 * Apply an action and return the resulting state. Returns `Result.err`
 * for any rules violation; never throws on rule violations.
 *
 * Note: re-dealing (when stick-the-dealer is OFF and all four pass in
 * round 2) is handled inside `applyAction` by reseeding from the engine's
 * stored RNG. The stored RNG is the one supplied to `createGame`; if no
 * RNG is needed (because all transitions away from a passed round 2 have
 * already been observed) the engine falls back to `defaultRng`.
 *
 * Because GameState does not carry an RNG, the caller needing a re-deal
 * path must supply one via `applyActionWithRng` instead.
 */
export function applyAction(
  state: GameState,
  action: Action,
): Result<GameState, RulesError> {
  return applyActionWithRng(state, action, defaultRng());
}

/**
 * Same as `applyAction` but accepts an explicit RNG. Used by tests and
 * by callers that need deterministic re-deals.
 */
export function applyActionWithRng(
  state: GameState,
  action: Action,
  rng: RNG,
): Result<GameState, RulesError> {
  switch (state.phase) {
    case 'dealing':
      // The dealing phase is transient and is currently only emitted as
      // an internal step within `startNewHand`. No external action is
      // legal here; surface as wrong-phase.
      return err(
        ruleError('wrong-phase', 'No actions are legal during dealing.'),
      );

    case 'bidding-round-1':
      if (action.type === 'discardKitty' || action.type === 'playCard') {
        return err(
          ruleError(
            'wrong-phase',
            `Action ${action.type} is not legal in bidding-round-1.`,
          ),
        );
      }
      return applyBiddingRound1(state, action);

    case 'bidding-round-2': {
      if (action.type === 'discardKitty' || action.type === 'playCard') {
        return err(
          ruleError(
            'wrong-phase',
            `Action ${action.type} is not legal in bidding-round-2.`,
          ),
        );
      }
      const r = applyBiddingRound2(state, action);
      // Detect the "all passed, re-deal required" sentinel and translate
      // it into a fresh dealing state with the next dealer.
      if (
        !r.ok &&
        r.error.kind === 'illegal-action' &&
        r.error.message.includes('re-deal required')
      ) {
        const nextDealer = leftOfSeat[state.dealer];
        const fresh = startNewHand({
          variants: state.variants,
          rng,
          dealer: nextDealer,
          score: state.score,
          gameId: state.gameId,
        });
        return ok(fresh);
      }
      return r;
    }

    case 'dealer-discard':
      if (action.type !== 'discardKitty') {
        return err(
          ruleError(
            'wrong-phase',
            'Only discardKitty is legal during dealer-discard.',
          ),
        );
      }
      return applyDealerDiscard(state, action);

    case 'playing':
      if (action.type !== 'playCard') {
        return err(
          ruleError('wrong-phase', 'Only playCard is legal during playing.'),
        );
      }
      return applyPlay(state, action);

    case 'hand-complete':
      // The next hand starts on the next applyAction with no input action;
      // but applyAction must take an Action. Provide a dedicated transition
      // through `advanceToNextHand` instead. Reject all actions here.
      return err(
        ruleError(
          'wrong-phase',
          'Hand is complete; call advanceToNextHand to deal the next hand.',
        ),
      );

    case 'game-complete':
      return err(ruleError('wrong-phase', 'The game is over.'));
  }
}

/* ------------------------------------------------------------------ */
/* dealer-discard                                                     */
/* ------------------------------------------------------------------ */

function applyDealerDiscard(
  state: DealerDiscardState,
  action: { type: 'discardKitty'; seat: Seat; card: Card },
): Result<GameState, RulesError> {
  if (action.seat !== state.dealer) {
    return err(
      ruleError('wrong-seat', `Only the dealer (${state.dealer}) may discard.`),
    );
  }
  const dealerHand = state.hands[state.dealer];
  const idx = indexOfCard(dealerHand, action.card);
  if (idx < 0) {
    return err(
      ruleError('card-not-in-hand', 'The discarded card is not in the dealer hand.'),
    );
  }
  const newDealerHand = removeCard(dealerHand, action.card);
  // removeCard returned non-null because indexOfCard found the card.
  const updatedHands = {
    ...state.hands,
    [state.dealer]: newDealerHand as readonly Card[],
  };

  // If alone, remove the maker's partner's hand (set to []).
  const sittingOut: Seat | null = state.alone
    ? partnerOfSeat[state.orderedUpBy]
    : null;
  const handsAfterAlone =
    sittingOut !== null ? { ...updatedHands, [sittingOut]: [] } : updatedHands;

  const trickLeader = openingLeader(state.dealer, sittingOut);

  const next: PlayingState = {
    phase: 'playing',
    gameId: state.gameId,
    handId: state.handId,
    variants: state.variants,
    dealer: state.dealer,
    score: state.score,
    hands: handsAfterAlone,
    trump: state.trump,
    maker: state.maker,
    makerSeat: state.orderedUpBy,
    alone: state.alone,
    sittingOut,
    orderedUpInRound: 1,
    trickLeader,
    turn: trickLeader,
    currentTrick: [],
    completedTricks: [],
    tricksWon: { makers: 0, defenders: 0 },
  };
  return ok(next);
}

/* ------------------------------------------------------------------ */
/* playing                                                            */
/* ------------------------------------------------------------------ */

function applyPlay(
  state: PlayingState,
  action: { type: 'playCard'; seat: Seat; card: Card },
): Result<GameState, RulesError> {
  if (action.seat !== state.turn) {
    return err(
      ruleError('wrong-seat', `It is ${state.turn}'s turn, not ${action.seat}.`),
    );
  }
  if (state.sittingOut !== null && state.sittingOut === action.seat) {
    return err(
      ruleError('wrong-seat', `${action.seat} is sitting out a lone hand.`),
    );
  }

  const hand = state.hands[action.seat];
  if (indexOfCard(hand, action.card) < 0) {
    return err(
      ruleError('card-not-in-hand', 'That card is not in the seat hand.'),
    );
  }
  const ledSuit: Suit | null = ledSuitOfTrick(state.currentTrick, state.trump);
  if (!isPlayLegal(hand, state.trump, ledSuit, action.card)) {
    return err(
      ruleError('must-follow-suit', 'You must follow the led suit if able.'),
    );
  }

  const newHand = removeCard(hand, action.card);
  const updatedHands = {
    ...state.hands,
    [action.seat]: newHand as readonly Card[],
  };
  const newCurrentTrick = [
    ...state.currentTrick,
    { seat: action.seat, card: action.card },
  ];

  // How many seats are participating in tricks this hand?
  const playersInHand = state.sittingOut === null ? 4 : 3;

  if (newCurrentTrick.length < playersInHand) {
    // Trick continues. Advance turn, skipping the sittingOut seat.
    let nextTurn = leftOfSeat[state.turn];
    if (state.sittingOut !== null && nextTurn === state.sittingOut) {
      nextTurn = leftOfSeat[nextTurn];
    }
    const next: PlayingState = {
      ...state,
      hands: updatedHands,
      currentTrick: newCurrentTrick,
      turn: nextTurn,
    };
    return ok(next);
  }

  // Trick is full: resolve.
  const winner = resolveTrick(newCurrentTrick, state.trump);
  const winnerPartnership = partnershipOfSeat[winner];
  const newTricksWon =
    winnerPartnership === state.maker
      ? { makers: state.tricksWon.makers + 1, defenders: state.tricksWon.defenders }
      : { makers: state.tricksWon.makers, defenders: state.tricksWon.defenders + 1 };
  const newCompletedTricks = [
    ...state.completedTricks,
    {
      leader: state.trickLeader,
      plays: newCurrentTrick,
      winner,
    },
  ];

  // Hand over?
  if (newCompletedTricks.length === 5) {
    const outcome = scoreHand({
      maker: state.maker,
      tricksWon: newTricksWon,
      alone: state.alone,
    });
    const pointsAwarded = pointsAwardedFromOutcome(outcome);
    const newScore = {
      ns: state.score.ns + pointsAwarded.ns,
      ew: state.score.ew + pointsAwarded.ew,
    };

    const result: HandResult = {
      handId: state.handId,
      dealer: state.dealer,
      maker: state.maker,
      trump: state.trump,
      alone: state.alone,
      tricksWon: newTricksWon,
      pointsAwarded,
      euchred: outcome.euchred,
      orderedUpInRound: state.orderedUpInRound,
    };

    const handComplete: HandCompleteState = {
      phase: 'hand-complete',
      gameId: state.gameId,
      variants: state.variants,
      dealer: state.dealer,
      score: newScore,
      result,
    };

    if (isGameOver(newScore, state.variants)) {
      const winnerPartnership2 = gameWinner(newScore, state.variants);
      // gameWinner returned non-null because isGameOver returned true.
      return ok({
        phase: 'game-complete',
        gameId: state.gameId,
        variants: state.variants,
        dealer: state.dealer,
        score: newScore,
        winner: winnerPartnership2 as 'ns' | 'ew',
        hands: [result],
      });
    }
    return ok(handComplete);
  }

  // More tricks to play. Winner leads the next.
  let nextLeader = winner;
  // If the winner is the sittingOut seat (impossible — they didn't play),
  // skip. Defensive only.
  if (state.sittingOut !== null && nextLeader === state.sittingOut) {
    nextLeader = leftOfSeat[nextLeader];
  }
  const next: PlayingState = {
    ...state,
    hands: updatedHands,
    currentTrick: [],
    completedTricks: newCompletedTricks,
    tricksWon: newTricksWon,
    trickLeader: nextLeader,
    turn: nextLeader,
  };
  return ok(next);
}

/* ------------------------------------------------------------------ */
/* advanceToNextHand                                                  */
/* ------------------------------------------------------------------ */

/**
 * Transition from `hand-complete` to a freshly dealt next hand. Caller
 * supplies the RNG so determinism is preserved across calls.
 */
export function advanceToNextHand(
  state: HandCompleteState,
  rng: RNG,
): GameState {
  const nextDealer = leftOfSeat[state.dealer];
  return startNewHand({
    variants: state.variants,
    rng,
    dealer: nextDealer,
    score: state.score,
    gameId: state.gameId,
  });
}

/* ------------------------------------------------------------------ */
/* legalActions / isLegal                                             */
/* ------------------------------------------------------------------ */

/**
 * Enumerate every action that `seat` could legally apply to `state`. Used
 * by AI and tests; not used by the UI directly (UIs typically present a
 * smaller subset of choices via dedicated controls).
 *
 * Returns an empty array if it is not `seat`'s turn or no actions are
 * legal in the current phase.
 */
export function legalActions(state: GameState, seat: Seat): readonly Action[] {
  switch (state.phase) {
    case 'dealing':
    case 'hand-complete':
    case 'game-complete':
      return [];

    case 'bidding-round-1': {
      if (state.turn !== seat) return [];
      const out: Action[] = [{ type: 'pass', seat }];
      out.push({ type: 'orderUp', seat, alone: false });
      if (state.variants.allowGoingAlone) {
        out.push({ type: 'orderUp', seat, alone: true });
      }
      return out;
    }

    case 'bidding-round-2': {
      if (state.turn !== seat) return [];
      const out: Action[] = [];
      const dealerStuck =
        state.variants.stickTheDealer && state.turn === state.dealer;
      if (!dealerStuck) {
        out.push({ type: 'pass', seat });
      }
      const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
      for (const s of suits) {
        if (s === state.rejectedSuit) continue;
        out.push({ type: 'callTrump', seat, suit: s, alone: false });
        if (state.variants.allowGoingAlone) {
          out.push({ type: 'callTrump', seat, suit: s, alone: true });
        }
      }
      return out;
    }

    case 'dealer-discard': {
      if (seat !== state.dealer) return [];
      const dealerHand = state.hands[state.dealer];
      return dealerHand.map<Action>((c) => ({
        type: 'discardKitty',
        seat,
        card: c,
      }));
    }

    case 'playing': {
      if (state.turn !== seat) return [];
      const hand = state.hands[seat];
      const led = ledSuitOfTrick(state.currentTrick, state.trump);
      const cards = legalPlays(hand, state.trump, led);
      return cards.map<Action>((c) => ({ type: 'playCard', seat, card: c }));
    }
  }
}

/**
 * True iff `action` would be accepted by `applyAction(state, action)`.
 *
 * Equivalent to running `applyAction` and checking `result.ok`, but this
 * helper makes the intent explicit at call sites.
 */
export function isLegal(state: GameState, action: Action): boolean {
  return applyAction(state, action).ok;
}
