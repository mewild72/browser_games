/**
 * Card primitives shared across all games in the suite.
 *
 * Euchre uses only the 9-A subset, but the types carry the full 13-rank set
 * (plus suits and colors) so future blackjack / poker / cribbage code can
 * reuse this layer without re-architecting.
 *
 * Owner: typescript-architect
 */

/** Four standard French suits. */
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

/**
 * Full 13-rank set. Euchre uses '9' | '10' | 'J' | 'Q' | 'K' | 'A',
 * but blackjack / poker / etc. need the lower ranks too.
 */
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

/** Card colors. Hearts and diamonds are red; clubs and spades are black. */
export type Color = 'red' | 'black';

/**
 * A single card.
 *
 * `deckId` is the per-deck instance id within a multi-deck shoe (0..deckCount-1).
 * Single-deck games (euchre, poker) may omit it. Multi-deck games (blackjack)
 * require it for unambiguous (suit, rank, deckId) equality.
 */
export type Card = {
  readonly suit: Suit;
  readonly rank: Rank;
  readonly deckId?: number;
};

/**
 * Suit color lookup. `const` so consumers (including the rules engine's
 * `effectiveSuit` helper) can read the same-color partner without runtime cost.
 */
export const colorOfSuit: Readonly<Record<Suit, Color>> = {
  clubs: 'black',
  spades: 'black',
  diamonds: 'red',
  hearts: 'red',
} as const;

/**
 * Same-color partner suit lookup. The Left Bower in euchre is the J of the
 * suit returned by this map for the trump suit.
 *
 * Example: `sameColorAs.hearts === 'diamonds'`.
 */
export const sameColorAs: Readonly<Record<Suit, Suit>> = {
  clubs: 'spades',
  spades: 'clubs',
  diamonds: 'hearts',
  hearts: 'diamonds',
} as const;

/**
 * Subset of ranks used by euchre (9 through Ace). Provided as a type so
 * euchre-specific code can narrow without forbidding the broader `Rank`
 * type from passing through generic shoe utilities.
 */
export type EuchreRank = Extract<Rank, '9' | '10' | 'J' | 'Q' | 'K' | 'A'>;

/** Compile-time list of euchre ranks for runtime iteration. */
export const euchreRanks: readonly EuchreRank[] = [
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;

/** Compile-time list of all suits for runtime iteration. */
export const allSuits: readonly Suit[] = [
  'clubs',
  'diamonds',
  'hearts',
  'spades',
] as const;

/** Compile-time list of all 13 ranks for runtime iteration. */
export const allRanks: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;
