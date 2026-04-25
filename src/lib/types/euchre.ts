/**
 * Euchre game state, actions, and outcome types.
 *
 * The `GameState` is a discriminated union keyed on `phase`. Every consumer
 * (UI, AI, rules engine, tests) must handle every phase, and TypeScript
 * narrows the available fields per branch so e.g. `state.trump` is only
 * legal once the phase has fixed trump.
 *
 * The shape follows `skills/euchre-rules.md`. When a phase needs a field
 * earlier phases also need, the field is duplicated across the relevant
 * variants — that keeps narrowing crisp without a bloated common-fields type.
 *
 * Owner: typescript-architect
 */

import type { Card, Suit } from './cards';
import type { Seat, Partnership } from './seats';

/* ------------------------------------------------------------------ */
/* Branded ids                                                        */
/* ------------------------------------------------------------------ */

/**
 * Branded `string` for game identifiers. Prevents accidental mixing with
 * plain strings or hand ids.
 */
export type GameId = string & { readonly __brand: 'GameId' };

/**
 * Branded `string` for hand identifiers (one game contains many hands).
 */
export type HandId = string & { readonly __brand: 'HandId' };

/* ------------------------------------------------------------------ */
/* Variants                                                           */
/* ------------------------------------------------------------------ */

/**
 * Variant flags. Mirrors `skills/euchre-rules.md`. Only fields whose values
 * are listed below are shipped in MVP; the rest are reserved for follow-on
 * work and validated by the rules engine when toggled on.
 */
export type Variants = {
  /** Number of cards in the deck. MVP ships 24; 28/32 reserved. */
  readonly deckSize: 24 | 28 | 32;
  /** Score required to win the game. */
  readonly pointsToWin: 5 | 7 | 10;
  /** If true, dealer is forced to call when both bidding rounds pass. */
  readonly stickTheDealer: boolean;
  /** If true, the stuck dealer is also forced to go alone. (Future.) */
  readonly screwTheDealer: boolean;
  /** Master switch for going-alone declarations. */
  readonly allowGoingAlone: boolean;
  /** Joker handling. (Future.) */
  readonly joker: 'none' | 'highest-trump';
  /** No-trump / "throw 'em in" support. (Future.) */
  readonly noTrump: boolean;
};

/** Project MVP defaults. Matches the table in `skills/euchre-rules.md`. */
export const defaults: Variants = {
  deckSize: 24,
  pointsToWin: 10,
  stickTheDealer: true,
  screwTheDealer: false,
  allowGoingAlone: true,
  joker: 'none',
  noTrump: false,
} as const;

/* ------------------------------------------------------------------ */
/* Score / tricks / hands                                             */
/* ------------------------------------------------------------------ */

/** Running game score, one entry per partnership. */
export type Score = {
  readonly ns: number;
  readonly ew: number;
};

/**
 * Trick tally for the active hand. `makers` is the partnership that called
 * trump; `defenders` is the other partnership.
 */
export type TricksWon = {
  readonly makers: number;
  readonly defenders: number;
};

/**
 * Per-seat hand contents. All four seats always have an entry; an empty
 * array represents a sitting-out lone-call partner or a fully-played hand.
 */
export type HandsBySeat = Readonly<Record<Seat, readonly Card[]>>;

/* ------------------------------------------------------------------ */
/* Trick history                                                      */
/* ------------------------------------------------------------------ */

/** One play within an in-progress or completed trick. */
export type TrickPlay = {
  readonly seat: Seat;
  readonly card: Card;
};

/** A completed trick with its winner recorded. */
export type CompletedTrick = {
  readonly leader: Seat;
  readonly plays: readonly TrickPlay[];
  readonly winner: Seat;
};

/* ------------------------------------------------------------------ */
/* Hand result                                                        */
/* ------------------------------------------------------------------ */

/**
 * Result of a single completed hand. Persists to the `hands` IndexedDB
 * table as well as feeding the in-memory game-complete branch.
 */
export type HandResult = {
  readonly handId: HandId;
  readonly dealer: Seat;
  /** The partnership that called trump. */
  readonly maker: Partnership;
  readonly trump: Suit;
  readonly alone: boolean;
  readonly tricksWon: TricksWon;
  /** Points awarded to each side this hand. */
  readonly pointsAwarded: Score;
  /** True iff makers took fewer than 3 tricks. */
  readonly euchred: boolean;
  /**
   * Which bidding step produced this hand's trump:
   *   - `1`        — ordered up in round 1
   *   - `2`        — called in round 2
   *   - `'stick'`  — stick-the-dealer forced call
   */
  readonly orderedUpInRound: 1 | 2 | 'stick';
};

/* ------------------------------------------------------------------ */
/* GameState — discriminated union on `phase`                         */
/* ------------------------------------------------------------------ */

/**
 * Phase: `'dealing'`.
 *
 * Cards are about to be dealt. Dealer is fixed; nothing else is yet.
 * Transitions into `'bidding-round-1'` once the deal completes.
 */
export type DealingState = {
  readonly phase: 'dealing';
  readonly gameId: GameId;
  readonly handId: HandId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
};

/**
 * Phase: `'bidding-round-1'`.
 *
 * Each player in turn (left of dealer first) may pass or order up the
 * turned card as trump.
 */
export type BiddingRound1State = {
  readonly phase: 'bidding-round-1';
  readonly gameId: GameId;
  readonly handId: HandId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
  readonly hands: HandsBySeat;
  /** Top card of the kitty, face up. */
  readonly turnedCard: Card;
  /** Remaining face-down kitty cards (3 in a 24-card deal). */
  readonly kitty: readonly Card[];
  /** Whose turn it is to act. */
  readonly turn: Seat;
  /** How many players have already passed in this round. */
  readonly passes: number;
};

/**
 * Phase: `'bidding-round-2'`.
 *
 * Round 1 was passed by all four players. The turned card is flipped down
 * and any suit other than the rejected one may be called.
 */
export type BiddingRound2State = {
  readonly phase: 'bidding-round-2';
  readonly gameId: GameId;
  readonly handId: HandId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
  readonly hands: HandsBySeat;
  /** The original turned card, now flipped face down. */
  readonly turnedCard: Card;
  readonly kitty: readonly Card[];
  /** The suit of the turned card; cannot be called this round. */
  readonly rejectedSuit: Suit;
  readonly turn: Seat;
  readonly passes: number;
};

/**
 * Phase: `'dealer-discard'`.
 *
 * Set after a player orders up in round 1. Dealer must take the turned card
 * into hand and discard one face down before play begins.
 *
 * Note: `hands[dealer]` already includes the turned card by the time this
 * phase is entered; the discard reduces `hands[dealer]` back to 5.
 */
export type DealerDiscardState = {
  readonly phase: 'dealer-discard';
  readonly gameId: GameId;
  readonly handId: HandId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
  readonly hands: HandsBySeat;
  readonly trump: Suit;
  /** Seat that ordered up. May be the dealer's partner, an opponent, or the dealer themselves. */
  readonly orderedUpBy: Seat;
  /** Partnership that called trump. */
  readonly maker: Partnership;
  /** True if the maker declared "alone". */
  readonly alone: boolean;
  /** Track which round produced the call so HandResult can record it. */
  readonly orderedUpInRound: 1;
};

/**
 * Phase: `'playing'`.
 *
 * Trump is fixed, dealer's discard (if any) is done, and tricks are being
 * played. The hand ends when 5 tricks have been recorded.
 */
export type PlayingState = {
  readonly phase: 'playing';
  readonly gameId: GameId;
  readonly handId: HandId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
  readonly hands: HandsBySeat;
  readonly trump: Suit;
  /** Partnership that called trump. */
  readonly maker: Partnership;
  /** Seat that called trump (used for lone-hand resolution). */
  readonly makerSeat: Seat;
  readonly alone: boolean;
  /** If alone, the seat that is sitting out (partner of `makerSeat`); else `null`. */
  readonly sittingOut: Seat | null;
  /** Which bidding step produced the trump. */
  readonly orderedUpInRound: 1 | 2 | 'stick';
  /** Seat that leads the current trick. */
  readonly trickLeader: Seat;
  /** Whose turn it is to play within the current trick. */
  readonly turn: Seat;
  /** Plays in the current (in-progress) trick, in order. */
  readonly currentTrick: readonly TrickPlay[];
  /** Completed tricks so far this hand. Length 0..5. */
  readonly completedTricks: readonly CompletedTrick[];
  /** Running trick count for this hand. */
  readonly tricksWon: TricksWon;
};

/**
 * Phase: `'hand-complete'`.
 *
 * All five tricks played; points awarded; ready to deal the next hand
 * unless the game-end threshold has been reached.
 */
export type HandCompleteState = {
  readonly phase: 'hand-complete';
  readonly gameId: GameId;
  readonly variants: Variants;
  readonly dealer: Seat;
  /** Score AFTER this hand's points are added. */
  readonly score: Score;
  readonly result: HandResult;
};

/**
 * Phase: `'game-complete'`.
 *
 * One partnership has reached `variants.pointsToWin`. No more actions are legal.
 */
export type GameCompleteState = {
  readonly phase: 'game-complete';
  readonly gameId: GameId;
  readonly variants: Variants;
  readonly dealer: Seat;
  readonly score: Score;
  readonly winner: Partnership;
  /** History of all hands played in this game. */
  readonly hands: readonly HandResult[];
};

/**
 * The full discriminated union. Every phase consumer must `switch`-exhaust
 * on `state.phase`; TypeScript will surface forgotten cases.
 */
export type GameState =
  | DealingState
  | BiddingRound1State
  | BiddingRound2State
  | DealerDiscardState
  | PlayingState
  | HandCompleteState
  | GameCompleteState;

/* ------------------------------------------------------------------ */
/* Action — discriminated union                                       */
/* ------------------------------------------------------------------ */

/** Order up the turned card in bidding round 1. */
export type OrderUpAction = {
  readonly type: 'orderUp';
  readonly seat: Seat;
  /** True if the maker is declaring "alone". */
  readonly alone: boolean;
};

/**
 * Pass during a bidding round.
 *
 * Note: a "pass" by the dealer in round 2 with stick-the-dealer ON is
 * illegal — the rules engine returns a `RulesError` rather than accepting
 * it. The action shape itself is identical regardless.
 */
export type PassAction = {
  readonly type: 'pass';
  readonly seat: Seat;
};

/**
 * Call any trump suit in bidding round 2 (or via stick-the-dealer).
 * The named suit must not equal the round-1 rejected suit.
 */
export type CallTrumpAction = {
  readonly type: 'callTrump';
  readonly seat: Seat;
  readonly suit: Suit;
  readonly alone: boolean;
};

/**
 * Dealer discards one card after picking up the turned card.
 * Only legal in the `'dealer-discard'` phase, only by the dealer seat.
 */
export type DiscardKittyAction = {
  readonly type: 'discardKitty';
  readonly seat: Seat;
  readonly card: Card;
};

/** Play a card to the current trick. */
export type PlayCardAction = {
  readonly type: 'playCard';
  readonly seat: Seat;
  readonly card: Card;
};

/** Every legal state-transition input the rules engine accepts. */
export type Action =
  | OrderUpAction
  | PassAction
  | CallTrumpAction
  | DiscardKittyAction
  | PlayCardAction;
