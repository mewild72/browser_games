/**
 * Card rank / suit helpers under a chosen trump.
 *
 * The Left Bower (Jack of the same color as trump) is treated as trump:
 *   - Its `effectiveSuit` is trump, not its native suit.
 *   - It outranks every non-bower trump card.
 *   - It is outranked only by the Right Bower (Jack of trump).
 *
 * Owner: game-rules-engine
 */

import { sameColorAs } from '@/lib/types';
import type { Card, Rank, Suit } from '@/lib/types';

/**
 * The "effective" suit of a card given the trump suit.
 *
 * The Left Bower (J of the same color as trump, but not trump's native J)
 * counts as trump, so its effective suit is `trump`. Every other card's
 * effective suit is its native suit.
 */
export function effectiveSuit(card: Card, trump: Suit): Suit {
  if (card.rank === 'J' && card.suit === sameColorAs[trump] && card.suit !== trump) {
    return trump;
  }
  return card.suit;
}

/**
 * True iff `card` is the Left Bower under the given trump suit.
 *
 * Equivalent to: J of the same color as trump but not the suit of trump.
 */
export function isLeftBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === sameColorAs[trump] && card.suit !== trump;
}

/**
 * True iff `card` is the Right Bower (J of trump).
 */
export function isRightBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === trump;
}

/**
 * True iff `card` is trump (including the Left Bower).
 */
export function isTrump(card: Card, trump: Suit): boolean {
  return effectiveSuit(card, trump) === trump;
}

/**
 * Off-trump rank order, low to high. The Jack is included here for
 * completeness but is filtered out for the same-color-as-trump suit
 * (where it is the Left Bower and counted as trump instead).
 */
const OFF_TRUMP_ORDER: readonly Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Trump rank order, low to high. The two bowers are handled specially in
 * `cardStrength` — this list covers the other trump cards in ascending order.
 */
const TRUMP_NON_BOWER_ORDER: readonly Rank[] = ['9', '10', 'Q', 'K', 'A'];

/**
 * Strength of `card` for trick comparison under `trump`, given the suit
 * that was led.
 *
 * Returns a numeric strength such that higher beats lower. Cards that are
 * neither trump nor of the led suit return a strength of 0 (they cannot
 * win the trick under any circumstance).
 *
 * The numeric scale is internal to this module — never persist it.
 */
export function cardStrength(card: Card, trump: Suit, led: Suit): number {
  if (isRightBower(card, trump)) return 100;
  if (isLeftBower(card, trump)) return 99;
  if (isTrump(card, trump)) {
    // Trump: rank within trump order, offset above the off-suit range.
    const idx = TRUMP_NON_BOWER_ORDER.indexOf(card.rank);
    // idx is always >= 0 here because non-bower trump cards always live in this list.
    return 50 + idx;
  }
  if (card.suit === led) {
    // Led off-suit: rank within off-trump order.
    const idx = OFF_TRUMP_ORDER.indexOf(card.rank);
    return idx;
  }
  return 0;
}

/**
 * Compare two cards under trump given the led suit.
 *
 * Returns positive if `a` beats `b`, negative if `b` beats `a`, 0 if equal
 * (which never happens in a single-deck game with distinct cards).
 */
export function compareCards(
  a: Card,
  b: Card,
  trump: Suit,
  led: Suit,
): number {
  return cardStrength(a, trump, led) - cardStrength(b, trump, led);
}
