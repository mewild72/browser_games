/**
 * Trick play: legal-move detection, applying a card to a trick,
 * and trick resolution.
 *
 * The Left Bower follows trump (not its native suit). `effectiveSuit`
 * encapsulates that rule; this module composes it.
 *
 * Owner: game-rules-engine
 */

import type { Card, Seat, Suit, TrickPlay } from '@/lib/types';
import { effectiveSuit, compareCards } from './ranks';

/**
 * Compute the legal cards a seat may play given:
 *   - their hand
 *   - the trump suit
 *   - the suit that was led for the current trick (or `null` if leading)
 *
 * Rules:
 *   - If leading, any card in hand is legal.
 *   - Otherwise, if the player has any card whose `effectiveSuit` matches
 *     the led suit, they MUST play one of those cards.
 *   - If they have no card of the led suit, any card is legal.
 *
 * Returns a fresh array; never mutates the input.
 */
export function legalPlays(
  hand: readonly Card[],
  trump: Suit,
  ledSuit: Suit | null,
): readonly Card[] {
  if (ledSuit === null) {
    return hand.slice();
  }
  const matching = hand.filter((c) => effectiveSuit(c, trump) === ledSuit);
  if (matching.length > 0) return matching;
  return hand.slice();
}

/**
 * True iff the given card is a legal play given the constraints.
 */
export function isPlayLegal(
  hand: readonly Card[],
  trump: Suit,
  ledSuit: Suit | null,
  card: Card,
): boolean {
  const legal = legalPlays(hand, trump, ledSuit);
  return legal.some(
    (c) => c.suit === card.suit && c.rank === card.rank && c.deckId === card.deckId,
  );
}

/**
 * Resolve a completed trick: return the winning seat.
 *
 * The trick winner is the highest-strength card under (`trump`, `ledSuit`).
 * `plays` must be non-empty; the first entry's card defines the led suit.
 *
 * Throws if `plays` is empty (programmer error — completed tricks always
 * have at least one play, and in a 4-player non-alone hand exactly four).
 */
export function resolveTrick(
  plays: readonly TrickPlay[],
  trump: Suit,
): Seat {
  if (plays.length === 0) {
    throw new Error('resolveTrick: cannot resolve an empty trick');
  }
  // plays[0] is defined by the length check above.
  const first = plays[0] as TrickPlay;
  const ledSuit = effectiveSuit(first.card, trump);
  let bestSeat: Seat = first.seat;
  let bestCard: Card = first.card;
  for (let i = 1; i < plays.length; i++) {
    // i < length, so plays[i] is defined.
    const p = plays[i] as TrickPlay;
    if (compareCards(p.card, bestCard, trump, ledSuit) > 0) {
      bestSeat = p.seat;
      bestCard = p.card;
    }
  }
  return bestSeat;
}

/**
 * The "led suit" of an in-progress trick — the effective suit of the first
 * play. Returns `null` if no play has been made yet.
 */
export function ledSuitOfTrick(
  plays: readonly TrickPlay[],
  trump: Suit,
): Suit | null {
  if (plays.length === 0) return null;
  // plays[0] defined by length check.
  return effectiveSuit((plays[0] as TrickPlay).card, trump);
}
