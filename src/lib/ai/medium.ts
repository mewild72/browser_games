/**
 * Medium bot.
 *
 * Behavior:
 *   - Tracks all cards played in the current hand (read fresh from
 *     `state.completedTricks` and `state.currentTrick`).
 *   - Infers per-opponent voids when a player fails to follow a led suit.
 *   - Bids using `handStrength` with seat- and stick-aware thresholds.
 *   - Goes alone when the hand is canonical-strong (both bowers + ace +
 *     trump count ≥ 4, or hand strength above an alone threshold).
 *   - Leading: leads trump if partner is maker; otherwise leads off-suit
 *     aces; avoids leading suits the next player is known void in (which
 *     would let them trump).
 *   - Following: when leading suit can be followed, plays the lowest
 *     winning card if currently losing, else dumps the lowest follow.
 *     When forced off-suit, dumps the lowest non-trump unless the trick
 *     can be trumped to win (and is going to opponents).
 *
 * Card-counting state is computed per call — the bot keeps no persistent
 * state. Determinism comes from the injected RNG only when the strict
 * heuristic produces ties.
 *
 * Owner: ai-strategy-expert
 */

import type {
  Action,
  Card,
  GameState,
  PlayCardAction,
  PlayingState,
  RNG,
  Seat,
  Suit,
} from '@/lib/types';
import { allSuits, leftOfSeat, partnerOfSeat, partnershipOfSeat } from '@/lib/types';
import { effectiveSuit, isTrump, legalActions } from '@/lib/euchre';
import type { Bot } from './types';
import {
  bestTrumpCandidate,
  bowerCount,
  currentTrickWinner,
  handStrength,
  hasLeftBower,
  hasRightBower,
  inferredVoids,
  trumpCount,
} from './heuristics';
import {
  cardsOfSuit,
  nonTrumpCards,
  offSuitAces as offSuitAceCards,
  pickLowestWinningCard,
  pickWeakest,
  trumpCards,
} from './selection';

/* ------------------------------------------------------------------ */
/* Tunable thresholds (calibrated by self-play tournament)            */
/* ------------------------------------------------------------------ */

/**
 * Seat-position multiplier for round-1 order-up threshold.
 *
 * Seats are ordered by "distance" from the dealer's left:
 *   - seat 1 (dealer's left): standard threshold
 *   - seat 2 (dealer's partner): standard threshold (helps the dealer)
 *   - seat 3 (dealer's right): LOWER threshold — passing risks the
 *     dealer's team picking it up
 *   - dealer:                 standard threshold (already gets the card)
 */
const ROUND1_THRESHOLD_BASE = 7.0;
const ROUND1_THRESHOLD_SEAT3 = 6.0;

/** Round-2 base threshold; lower in stick-the-dealer forced cases. */
const ROUND2_THRESHOLD_BASE = 6.5;

/** Going-alone threshold (very high — only on truly dominant hands). */
const ALONE_THRESHOLD = 11.0;

/* ------------------------------------------------------------------ */
/* Bidding decision                                                   */
/* ------------------------------------------------------------------ */

/** Position relative to dealer. seat3 = dealer's right (third to act in r1). */
function bidderPosition(seat: Seat, dealer: Seat): 'left' | 'partner' | 'right' | 'dealer' {
  if (seat === dealer) return 'dealer';
  if (seat === leftOfSeat[dealer]) return 'left';
  if (seat === partnerOfSeat[dealer]) return 'partner';
  return 'right';
}

/**
 * Decide whether to go alone given the strongest hand-strength score and
 * the actual hand contents.
 */
function shouldGoAlone(
  hand: readonly Card[],
  trump: Suit,
  strength: number,
  allowAlone: boolean,
): boolean {
  if (!allowAlone) return false;
  // Canonical: both bowers + ace of trump + trump count ≥ 4.
  const tc = trumpCount(hand, trump);
  if (
    hasRightBower(hand, trump) &&
    hasLeftBower(hand, trump) &&
    tc >= 4 &&
    hand.some((c) => c.rank === 'A' && c.suit === trump)
  ) {
    return true;
  }
  // Otherwise require a very high strength score.
  return strength >= ALONE_THRESHOLD;
}

/* ------------------------------------------------------------------ */
/* Lead / follow play                                                 */
/* ------------------------------------------------------------------ */

/**
 * Pick a card to lead. Strategy:
 *   1. If partner is maker (and we are not maker): lead trump if we have
 *      any (helps partner pull trump from defenders).
 *   2. Otherwise prefer to lead an off-suit ace if we have one (likely
 *      to win the trick outright).
 *   3. Otherwise lead the highest non-trump card whose suit is not known
 *      to be void on our left (the next-to-act seat) — leading into a
 *      void lets them trump us cheaply.
 *   4. Fall back to the lowest non-trump card; failing that, the lowest
 *      trump.
 */
function pickLead(state: PlayingState, seat: Seat): Card {
  const hand = state.hands[seat];
  const trump = state.trump;
  const partnerIsMaker =
    state.maker === partnershipOfSeat[seat] && state.makerSeat !== seat;
  const voidsBySeat = inferredVoids(state);
  const nextSeat = (() => {
    let n = leftOfSeat[seat];
    if (state.sittingOut !== null && n === state.sittingOut) {
      n = leftOfSeat[n];
    }
    return n;
  })();
  const nextVoids = voidsBySeat.get(nextSeat) ?? new Set<Suit>();

  // 1. partner-is-maker → lead trump if we have any
  if (partnerIsMaker) {
    const trumps = trumpCards(hand, trump);
    if (trumps.length > 0) {
      // Lead a mid-strength trump (pull defenders' trump without burning a bower).
      // Heuristic: pick the second-strongest trump if we have ≥ 2; else the weakest.
      if (trumps.length >= 2) {
        const sorted = [...trumps].sort(
          (a, b) =>
            // Strongest first
            cmpStrength(b, a, trump),
        );
        return sorted[1] as Card;
      }
      return trumps[0] as Card;
    }
  }

  // 2. off-suit ace if we have one (and the suit isn't dead — heuristic: if
  // the next seat is void in that suit, skip)
  const aces = offSuitAceCards(hand, trump);
  for (const a of aces) {
    if (!nextVoids.has(a.suit)) return a;
  }
  // Even if next seat is void in every off-suit-ace suit, an ace is still
  // a strong lead (others may not be able to trump effectively).
  if (aces.length > 0) return aces[0] as Card;

  // 3. Highest non-trump that's not in next-seat's void list.
  const nonTrump = nonTrumpCards(hand, trump);
  if (nonTrump.length > 0) {
    // Sort high → low.
    const sorted = [...nonTrump].sort(
      (a, b) =>
        cmpStrength(b, a, trump),
    );
    for (const c of sorted) {
      if (!nextVoids.has(effectiveSuit(c, trump))) return c;
    }
    // All suits are void on next seat — lead the LOWEST non-trump (give
    // them as little as possible to trump for value).
    return sorted[sorted.length - 1] as Card;
  }

  // 4. All trump — lead the lowest trump.
  return pickWeakest(hand, trump, trump);
}

/**
 * Strength compare independent of "led" (lead context). Uses trump as led
 * so trump cards rank highest among trumps; non-trump cards rank by their
 * native suit's order.
 *
 * NB: under a non-trump led-suit context, off-suit cards get strength 0;
 * we don't want that for lead selection, so we substitute a custom scale.
 */
function cmpStrength(a: Card, b: Card, trump: Suit): number {
  return rawStrength(a, trump) - rawStrength(b, trump);
}

function rawStrength(card: Card, trump: Suit): number {
  if (isTrump(card, trump)) {
    // Use the engine's strength under led=trump for an ordering of trumps.
    // Right > left > A > K > Q > 10 > 9.
    if (card.rank === 'J' && card.suit === trump) return 100; // right
    if (card.rank === 'J' && effectiveSuit(card, trump) === trump) return 99; // left
    const trumpOrder: Record<string, number> = {
      A: 54,
      K: 53,
      Q: 52,
      '10': 51,
      '9': 50,
    };
    return trumpOrder[card.rank] ?? 50;
  }
  // Non-trump: rank within suit.
  const order: Record<string, number> = {
    '9': 0,
    '10': 1,
    J: 2,
    Q: 3,
    K: 4,
    A: 5,
  };
  return order[card.rank] ?? 0;
}

/**
 * Pick a follow card. The legal-set is already constrained by the engine
 * to "must follow if able"; we just choose within that set.
 */
function pickFollow(
  state: PlayingState,
  seat: Seat,
  legal: readonly Card[],
): Card {
  const trump = state.trump;
  const trick = state.currentTrick;
  const led = effectiveSuit(trick[0]!.card, trump);
  const winner = currentTrickWinner(trick, trump);
  // winner is non-null because trick.length >= 1 (we are not leader).
  const winningCard = winner!.card;
  const winningSeat = winner!.seat;
  const winnerOnOurTeam =
    partnershipOfSeat[winningSeat] === partnershipOfSeat[seat] &&
    winningSeat !== seat;

  // We're playing last? Determine by remaining seats.
  const playersInHand = state.sittingOut === null ? 4 : 3;
  const isLastToPlay = trick.length === playersInHand - 1;

  // CASE A: partner is currently winning the trick.
  if (winnerOnOurTeam) {
    if (isLastToPlay) {
      // Partner has won — dump the lowest legal card.
      return pickWeakest(legal, trump, led);
    }
    // Mid-trick: partner is winning but more players to come. Still dump
    // low — partner will hold up unless trumped, in which case we couldn't
    // have helped from this seat anyway.
    return pickWeakest(legal, trump, led);
  }

  // CASE B: opponents are currently winning. Try to win cheaply.
  const winningCard2 = winningCard;
  const winnerLegal = pickLowestWinningCard(legal, winningCard2, trump, led);
  if (winnerLegal !== null) {
    // We can take it. If we're last to play, definitely take it.
    // Otherwise, we should still take if we can do so cheaply (the
    // remaining player(s) might over-trump, but that's a risk we accept
    // — the alternative is dumping a card that's likely to lose anyway).
    return winnerLegal;
  }

  // CASE C: we cannot win. Dump the lowest legal card.
  // If we're being forced off-suit (legal includes trump), prefer to dump
  // the lowest NON-TRUMP card (preserve trump for later).
  const nonT = legal.filter((c) => !isTrump(c, trump));
  if (nonT.length > 0) {
    return pickWeakest(nonT, trump, led);
  }
  return pickWeakest(legal, trump, led);
}

/* ------------------------------------------------------------------ */
/* Dealer discard                                                     */
/* ------------------------------------------------------------------ */

/**
 * Pick the dealer's discard after picking up the turned card.
 *
 * Strategy:
 *   1. Prefer to discard a non-trump card (we want to preserve trump).
 *   2. Among non-trump, prefer to discard from a suit we are now SHORT
 *      in (creates a void for trumping later). Lowest card wins ties.
 *   3. If only trump remains, discard the weakest trump.
 */
function pickDiscard(hand: readonly Card[], trump: Suit): Card {
  const nonT = nonTrumpCards(hand, trump);
  if (nonT.length > 0) {
    // Prefer to create a void: count cards per off-suit, pick the suit
    // with exactly 1 card (creating a void) before suits with more.
    type Bucket = { suit: Suit; cards: Card[] };
    const buckets = new Map<Suit, Bucket>();
    for (const c of nonT) {
      const eff = effectiveSuit(c, trump);
      let b = buckets.get(eff);
      if (b === undefined) {
        b = { suit: eff, cards: [] };
        buckets.set(eff, b);
      }
      b.cards.push(c);
    }
    // Sort buckets by size ascending (smallest first → singleton → void).
    const ordered = [...buckets.values()].sort(
      (a, b) => a.cards.length - b.cards.length,
    );
    // First bucket is shortest; pick its weakest card.
    const target = ordered[0]!;
    return pickWeakest(target.cards, trump, target.suit);
  }
  // All trump — discard the weakest trump.
  return pickWeakest(hand, trump, trump);
}

/* ------------------------------------------------------------------ */
/* Top-level decide                                                   */
/* ------------------------------------------------------------------ */

async function decide(
  state: GameState,
  seat: Seat,
  rng: RNG,
): Promise<Action> {
  const choices = legalActions(state, seat);
  if (choices.length === 0) {
    throw new Error(
      `mediumBot.decide: no legal actions for ${seat} in phase ${state.phase}`,
    );
  }

  switch (state.phase) {
    case 'bidding-round-1': {
      const trump = state.turnedCard.suit;
      const dealer = state.dealer;
      const hand = state.hands[seat];
      const asMaker = true; // ordering up makes us / our partner the maker
      // Adjust the hand for the dealer-pickup if appropriate. The dealer
      // (or partner) gains the turned card; we approximate by including it.
      let effectiveHand = hand;
      if (seat === dealer || partnerOfSeat[seat] === dealer) {
        // Going to dealer's team: dealer will pick up, replacing weakest.
        // Approximate strength by adding the turned card (no removal — slight overestimate).
        effectiveHand = [...hand, state.turnedCard];
      }
      const strength = handStrength({
        hand: effectiveHand,
        trump,
        kittyTopCard: state.turnedCard,
        asMaker,
      });

      const pos = bidderPosition(seat, dealer);
      const threshold =
        pos === 'right' ? ROUND1_THRESHOLD_SEAT3 : ROUND1_THRESHOLD_BASE;

      if (strength >= threshold) {
        const goAlone = shouldGoAlone(
          hand,
          trump,
          strength,
          state.variants.allowGoingAlone,
        );
        const action = choices.find(
          (a) => a.type === 'orderUp' && a.alone === goAlone,
        );
        if (action !== undefined) return action;
        // Fall back to non-alone orderUp if the alone variant isn't legal.
        const fallback = choices.find(
          (a) => a.type === 'orderUp' && a.alone === false,
        );
        if (fallback !== undefined) return fallback;
      }
      const passAction = choices.find((a) => a.type === 'pass');
      if (passAction !== undefined) return passAction;
      return choices[0] as Action;
    }

    case 'bidding-round-2': {
      const dealer = state.dealer;
      const hand = state.hands[seat];
      const dealerStuck =
        state.variants.stickTheDealer && state.turn === dealer;

      // Find the strongest non-rejected suit.
      const candidate = bestTrumpCandidate(hand, state.rejectedSuit, true);
      const threshold = dealerStuck
        ? -Infinity // Stuck — must call no matter what.
        : ROUND2_THRESHOLD_BASE;

      if (candidate !== null && candidate.score >= threshold) {
        const goAlone = shouldGoAlone(
          hand,
          candidate.suit,
          candidate.score,
          state.variants.allowGoingAlone,
        );
        const action = choices.find(
          (a) =>
            a.type === 'callTrump' &&
            a.suit === candidate.suit &&
            a.alone === goAlone,
        );
        if (action !== undefined) return action;
        const fallback = choices.find(
          (a) =>
            a.type === 'callTrump' &&
            a.suit === candidate.suit &&
            a.alone === false,
        );
        if (fallback !== undefined) return fallback;
      }
      const passAction = choices.find((a) => a.type === 'pass');
      if (passAction !== undefined) return passAction;
      // Stuck and somehow no candidate (impossible) — pick first available.
      // Tie-break stably with rng.
      const callTrumps = choices.filter(
        (a) => a.type === 'callTrump' && a.alone === false,
      );
      if (callTrumps.length > 0) {
        return callTrumps[
          Math.floor(rng.next() * callTrumps.length)
        ] as Action;
      }
      return choices[0] as Action;
    }

    case 'dealer-discard': {
      const hand = state.hands[seat];
      const card = pickDiscard(hand, state.trump);
      const action = choices.find(
        (a) =>
          a.type === 'discardKitty' &&
          a.card.suit === card.suit &&
          a.card.rank === card.rank,
      );
      if (action !== undefined) return action;
      return choices[0] as Action;
    }

    case 'playing': {
      const playChoices = choices.filter(
        (a): a is PlayCardAction => a.type === 'playCard',
      );
      const legalCards = playChoices.map((a) => a.card);
      const isLeading = state.currentTrick.length === 0;
      const card = isLeading
        ? pickLead(state, seat)
        : pickFollow(state, seat, legalCards);
      // The chosen card MUST be in the legal set; if not (defensive), fall
      // back to the first legal play.
      const action = playChoices.find(
        (a) => a.card.suit === card.suit && a.card.rank === card.rank,
      );
      if (action !== undefined) return action;
      return playChoices[0] as Action;
    }

    case 'dealing':
    case 'hand-complete':
    case 'game-complete':
      throw new Error(
        `mediumBot.decide: unexpected phase ${state.phase} with non-empty legalActions`,
      );
  }
}

/** Factory for the Medium bot. */
export function mediumBot(name = 'Medium'): Bot {
  return {
    name,
    difficulty: 'medium',
    decide,
  };
}

/* ------------------------------------------------------------------ */
/* Internal: keep linters happy if any helper is unused after edits.  */
/* ------------------------------------------------------------------ */
// Touched here so future refactors notice if these go unused.
void cardsOfSuit;
void bowerCount;
void allSuits;
