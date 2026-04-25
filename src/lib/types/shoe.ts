/**
 * Generic deck and shoe types reusable across games.
 *
 * A `Deck<T>` is a single ordered collection of card-like values.
 * A `Shoe<T>` composes 1-6 decks into one shuffled source, optionally with
 * a cut card and a reference to the RNG that produced the order.
 *
 * Euchre uses `Shoe<Card>` with `deckCount: 1` and a 24-card rank filter
 * applied at deck construction time. Future blackjack uses `Shoe<Card>` with
 * `deckCount: 6` and no rank filter.
 *
 * Owner: typescript-architect
 */

import type { RNG } from './rng';

/** A single deck — a readonly ordered list of card-like values. */
export type Deck<T> = readonly T[];

/** Allowed shoe sizes. Blackjack standard is 6; most other games use 1. */
export type DeckCount = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A shuffled multi-deck source.
 *
 * - `cards` is the live ordered list, consumed from the front (index 0).
 * - `cutDepth`, when set, marks the position of the cut card; games that
 *   reshuffle on the cut compare `consumed >= cutDepth`.
 * - `rng` is the source that produced the current order; held so a
 *   subsequent reshuffle uses the same source unless the caller swaps it.
 */
export type Shoe<T> = {
  readonly deckCount: DeckCount;
  readonly cards: readonly T[];
  readonly cutDepth?: number;
  readonly rng: RNG;
};
