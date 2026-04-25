/**
 * 24-card euchre deck construction.
 *
 * Pure: returns a fresh frozen array on each call. Deck composition is
 * deterministic — order is suit-major (clubs, diamonds, hearts, spades),
 * rank-minor (9, 10, J, Q, K, A) — but consumers should `shuffle()` before
 * dealing.
 *
 * Owner: game-rules-engine
 */

import { allSuits, euchreRanks } from '@/lib/types';
import type { Card } from '@/lib/types';

/**
 * Build the canonical 24-card euchre deck: 9, 10, J, Q, K, A in each of
 * the four suits. `deckId` is omitted (single-deck game).
 */
export function build24CardDeck(): readonly Card[] {
  const cards: Card[] = [];
  for (const suit of allSuits) {
    for (const rank of euchreRanks) {
      cards.push({ suit, rank });
    }
  }
  return cards;
}
