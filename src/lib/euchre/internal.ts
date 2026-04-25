/**
 * Engine-internal helpers: ID minting, error construction, card equality.
 *
 * Not part of the public API — kept out of `index.ts`. These exist to
 * concentrate boilerplate so the rules modules stay focused on rule logic.
 *
 * Owner: game-rules-engine
 */

import type {
  Card,
  GameId,
  HandId,
  Result,
  RulesError,
  RulesErrorKind,
  Seat,
} from '@/lib/types';
import { partnershipOfSeat } from '@/lib/types';

/** Construct a RulesError. */
export function ruleError(kind: RulesErrorKind, message: string): RulesError {
  return { kind, message };
}

/** Wrap a value in `Result.ok`. */
export function ok<T>(value: T): Result<T, RulesError> {
  return { ok: true, value };
}

/** Wrap an error in `Result.err`. */
export function err<T>(error: RulesError): Result<T, RulesError> {
  return { ok: false, error };
}

/**
 * Card equality using `(suit, rank, deckId)`. Single-deck euchre never sets
 * `deckId`, so the triple collapses to `(suit, rank)`, but we honor the
 * deckId everywhere so the helper is reusable for future multi-deck games.
 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank && a.deckId === b.deckId;
}

/**
 * Find the index of `card` in `hand`, or -1 if not present.
 */
export function indexOfCard(hand: readonly Card[], card: Card): number {
  for (let i = 0; i < hand.length; i++) {
    // hand[i] is defined for i < length.
    if (cardsEqual(hand[i] as Card, card)) return i;
  }
  return -1;
}

/**
 * Remove the first matching card from `hand` and return the new array.
 * If the card is not present, returns `null`.
 */
export function removeCard(hand: readonly Card[], card: Card): readonly Card[] | null {
  const idx = indexOfCard(hand, card);
  if (idx < 0) return null;
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

/* ------------------------------------------------------------------ */
/* ID generation — deterministic via injected counter, NOT randomness */
/* ------------------------------------------------------------------ */

let gameIdCounter = 0;
let handIdCounter = 0;

/**
 * Mint a new GameId. Deterministic per-process: the counter is monotonic
 * but does NOT use randomness — so given the same call sequence, ids are
 * reproducible across runs of the same test. (Tests that need fully
 * isolated ids should reset via `__resetIdCounters` below.)
 */
export function nextGameId(): GameId {
  gameIdCounter++;
  return `game-${gameIdCounter}` as GameId;
}

export function nextHandId(): HandId {
  handIdCounter++;
  return `hand-${handIdCounter}` as HandId;
}

/** Test-only counter reset. Not exposed via the public barrel. */
export function __resetIdCounters(): void {
  gameIdCounter = 0;
  handIdCounter = 0;
}

/** Re-export partnership lookup for engine modules. */
export { partnershipOfSeat };

/** Look up the partnership opposite to the given seat. */
export function opposingPartnership(seat: Seat): 'ns' | 'ew' {
  return partnershipOfSeat[seat] === 'ns' ? 'ew' : 'ns';
}
