/**
 * Card-selection utilities used by both Easy and Medium tiers.
 *
 * These functions sort and filter cards. They never mutate input arrays.
 * They depend only on rank/suit helpers from the rules engine — no
 * game-state arguments — so they're pure and easy to test.
 *
 * Owner: ai-strategy-expert
 */

import type { Card, Suit } from '@/lib/types';
import {
  compareCards,
  effectiveSuit,
  isLeftBower,
  isRightBower,
  isTrump,
} from '@/lib/euchre';

/**
 * Sort cards by trick-winning strength under (trump, led).
 * Returns a new array; does not mutate input. Highest first.
 */
export function sortByStrength(
  cards: readonly Card[],
  trump: Suit,
  led: Suit,
): readonly Card[] {
  return [...cards].sort((a, b) => compareCards(b, a, trump, led));
}

/** Pick the strongest card in `cards`. Throws if empty (programmer error). */
export function pickStrongest(
  cards: readonly Card[],
  trump: Suit,
  led: Suit,
): Card {
  if (cards.length === 0) {
    throw new Error('pickStrongest: cards is empty');
  }
  let best = cards[0]!;
  for (let i = 1; i < cards.length; i++) {
    if (compareCards(cards[i]!, best, trump, led) > 0) best = cards[i]!;
  }
  return best;
}

/** Pick the weakest card in `cards`. Throws if empty (programmer error). */
export function pickWeakest(
  cards: readonly Card[],
  trump: Suit,
  led: Suit,
): Card {
  if (cards.length === 0) {
    throw new Error('pickWeakest: cards is empty');
  }
  let worst = cards[0]!;
  for (let i = 1; i < cards.length; i++) {
    if (compareCards(cards[i]!, worst, trump, led) < 0) worst = cards[i]!;
  }
  return worst;
}

/**
 * Of `legal`, pick the lowest card that beats `cardToBeat` under trump+led.
 * Returns `null` if no legal card beats it.
 */
export function pickLowestWinningCard(
  legal: readonly Card[],
  cardToBeat: Card,
  trump: Suit,
  led: Suit,
): Card | null {
  let best: Card | null = null;
  for (const c of legal) {
    if (compareCards(c, cardToBeat, trump, led) > 0) {
      // c beats cardToBeat. Take the weakest such c.
      if (best === null || compareCards(c, best, trump, led) < 0) {
        best = c;
      }
    }
  }
  return best;
}

/**
 * Filter to non-trump cards (cards whose effective suit is not trump).
 */
export function nonTrumpCards(
  cards: readonly Card[],
  trump: Suit,
): readonly Card[] {
  return cards.filter((c) => !isTrump(c, trump));
}

/** Filter to trump cards (effective suit equals trump — includes Left Bower). */
export function trumpCards(
  cards: readonly Card[],
  trump: Suit,
): readonly Card[] {
  return cards.filter((c) => isTrump(c, trump));
}

/** Pick all cards whose effective suit is `suit`. */
export function cardsOfSuit(
  cards: readonly Card[],
  suit: Suit,
  trump: Suit,
): readonly Card[] {
  return cards.filter((c) => effectiveSuit(c, trump) === suit);
}

/**
 * Off-suit aces in the hand under the given trump.
 *
 * A trump-suit ace is excluded (it's trump, not an off-suit ace). The
 * Jacks that are bowers are also excluded — they're trump.
 */
export function offSuitAces(
  hand: readonly Card[],
  trump: Suit,
): readonly Card[] {
  return hand.filter((c) => {
    if (c.rank !== 'A') return false;
    if (isRightBower(c, trump) || isLeftBower(c, trump)) return false;
    return !isTrump(c, trump);
  });
}
