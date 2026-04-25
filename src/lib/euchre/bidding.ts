/**
 * Bidding-phase transitions: round 1, round 2, and stick-the-dealer.
 *
 * Each function takes the current state and the action, validates that the
 * action is legal for the current phase/seat/turn, and returns the next
 * state. Validation failures return a Result.err — they never throw.
 *
 * Owner: game-rules-engine
 */

import type {
  BiddingRound1State,
  BiddingRound2State,
  CallTrumpAction,
  Card,
  DealerDiscardState,
  GameState,
  HandsBySeat,
  OrderUpAction,
  PassAction,
  PlayingState,
  Result,
  RulesError,
  Seat,
  Suit,
} from '@/lib/types';
import { leftOfSeat, partnerOfSeat, partnershipOfSeat } from '@/lib/types';
import { err, ok, ruleError } from './internal';

/**
 * The seat that leads the opening trick, given the dealer and any
 * lone-hand sitting-out partner.
 *
 * Standard rule: lead is the seat to the dealer's left.
 * Lone-hand exception: if the lone caller's partner would otherwise lead
 * (i.e., that partner is to the dealer's left and is the one sitting out),
 * lead passes to the next seat.
 */
export function openingLeader(dealer: Seat, sittingOut: Seat | null): Seat {
  const standard = leftOfSeat[dealer];
  if (sittingOut !== null && sittingOut === standard) {
    return leftOfSeat[standard];
  }
  return standard;
}

/**
 * Hand state after the dealer picks up the turned card. Adds the turned
 * card to the dealer's hand (now 6 cards) — the dealer must discard one
 * before play begins.
 */
function handsAfterDealerPickup(
  hands: HandsBySeat,
  dealer: Seat,
  turnedCard: Card,
): HandsBySeat {
  const dealerHand = hands[dealer];
  return {
    ...hands,
    [dealer]: [...dealerHand, turnedCard],
  };
}

/* ------------------------------------------------------------------ */
/* Round 1                                                            */
/* ------------------------------------------------------------------ */

/**
 * Apply an action in `bidding-round-1`.
 *
 * Legal actions:
 *   - `pass` by the seat whose turn it is
 *   - `orderUp` by the seat whose turn it is (only if `allowGoingAlone`
 *     is true when `alone === true`)
 */
export function applyBiddingRound1(
  state: BiddingRound1State,
  action: OrderUpAction | PassAction | CallTrumpAction,
): Result<GameState, RulesError> {
  if (action.seat !== state.turn) {
    return err(ruleError('wrong-seat', `It is ${state.turn}'s turn, not ${action.seat}.`));
  }

  if (action.type === 'callTrump') {
    return err(ruleError('illegal-action', 'callTrump is not legal in round 1; use orderUp.'));
  }

  if (action.type === 'pass') {
    const passes = state.passes + 1;
    if (passes >= 4) {
      // All four passed; advance to round 2 with the dealer's left to act.
      const next: BiddingRound2State = {
        phase: 'bidding-round-2',
        gameId: state.gameId,
        handId: state.handId,
        variants: state.variants,
        dealer: state.dealer,
        score: state.score,
        hands: state.hands,
        turnedCard: state.turnedCard,
        kitty: state.kitty,
        rejectedSuit: state.turnedCard.suit,
        turn: leftOfSeat[state.dealer],
        passes: 0,
      };
      return ok(next);
    }
    const next: BiddingRound1State = {
      ...state,
      turn: leftOfSeat[state.turn],
      passes,
    };
    return ok(next);
  }

  // orderUp
  if (action.alone && !state.variants.allowGoingAlone) {
    return err(
      ruleError(
        'going-alone-not-allowed',
        'allowGoingAlone is false; cannot declare alone.',
      ),
    );
  }

  const trump: Suit = state.turnedCard.suit;
  const orderedUpBy = action.seat;
  const maker = partnershipOfSeat[orderedUpBy];

  // Move into dealer-discard. The dealer's hand grows to 6 cards (turned
  // card included); the discard action will reduce it back to 5.
  const handsWithPickup = handsAfterDealerPickup(
    state.hands,
    state.dealer,
    state.turnedCard,
  );

  const next: DealerDiscardState = {
    phase: 'dealer-discard',
    gameId: state.gameId,
    handId: state.handId,
    variants: state.variants,
    dealer: state.dealer,
    score: state.score,
    hands: handsWithPickup,
    trump,
    orderedUpBy,
    maker,
    alone: action.alone,
    orderedUpInRound: 1,
  };
  return ok(next);
}

/* ------------------------------------------------------------------ */
/* Round 2 (and stick-the-dealer)                                     */
/* ------------------------------------------------------------------ */

/**
 * Apply an action in `bidding-round-2`. This includes the stick-the-dealer
 * forced-call case: when stick-the-dealer is ON and the dealer is up, a
 * pass is rejected (`illegal-action`).
 */
export function applyBiddingRound2(
  state: BiddingRound2State,
  action: OrderUpAction | PassAction | CallTrumpAction,
): Result<GameState, RulesError> {
  if (action.seat !== state.turn) {
    return err(ruleError('wrong-seat', `It is ${state.turn}'s turn, not ${action.seat}.`));
  }

  if (action.type === 'orderUp') {
    return err(
      ruleError('illegal-action', 'orderUp is not legal in round 2; use callTrump.'),
    );
  }

  if (action.type === 'pass') {
    // Stick-the-dealer: dealer cannot pass when it's their turn and STD is on.
    if (state.variants.stickTheDealer && state.turn === state.dealer) {
      return err(
        ruleError(
          'illegal-action',
          'Stick-the-dealer is on; the dealer must call trump.',
        ),
      );
    }
    const passes = state.passes + 1;
    if (passes >= 4) {
      // All four passed in round 2 with STD off — re-deal is required, but
      // re-deal is a separate concern handled at the engine layer (the
      // engine builds a brand-new dealing state with the next dealer). To
      // keep the bidding module pure, we surface this with a special error
      // kind that the top-level dispatcher handles.
      return err(
        ruleError(
          'illegal-action',
          'All four passed in round 2 with stick-the-dealer off; re-deal required.',
        ),
      );
    }
    const next: BiddingRound2State = {
      ...state,
      turn: leftOfSeat[state.turn],
      passes,
    };
    return ok(next);
  }

  // callTrump
  if (action.suit === state.rejectedSuit) {
    return err(
      ruleError(
        'suit-already-rejected',
        `Cannot call ${action.suit}; it was the rejected suit.`,
      ),
    );
  }
  if (action.alone && !state.variants.allowGoingAlone) {
    return err(
      ruleError(
        'going-alone-not-allowed',
        'allowGoingAlone is false; cannot declare alone.',
      ),
    );
  }

  // Determine if this call was via stick-the-dealer (dealer's forced call
  // when STD is on) vs an ordinary round-2 call.
  const isStick =
    state.variants.stickTheDealer &&
    state.turn === state.dealer &&
    state.passes === 3;

  const maker = partnershipOfSeat[action.seat];
  const sittingOut: Seat | null = action.alone ? partnerOfSeat[action.seat] : null;
  const trickLeader = openingLeader(state.dealer, sittingOut);

  // Move directly to playing — no dealer pickup/discard in round 2.
  const next: PlayingState = {
    phase: 'playing',
    gameId: state.gameId,
    handId: state.handId,
    variants: state.variants,
    dealer: state.dealer,
    score: state.score,
    hands: action.alone
      ? {
          ...state.hands,
          [partnerOfSeat[action.seat]]: [],
        }
      : state.hands,
    trump: action.suit,
    maker,
    makerSeat: action.seat,
    alone: action.alone,
    sittingOut,
    orderedUpInRound: isStick ? 'stick' : 2,
    trickLeader,
    turn: trickLeader,
    currentTrick: [],
    completedTricks: [],
    tricksWon: { makers: 0, defenders: 0 },
  };
  return ok(next);
}
