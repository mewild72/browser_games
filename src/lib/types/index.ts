/**
 * Barrel export for the type layer.
 *
 * Consumers import from `@/lib/types` and never reach into individual files.
 * This keeps the public surface stable as files split or merge.
 *
 * Owner: typescript-architect
 */

export type { Suit, Rank, Color, Card, EuchreRank } from './cards';
export {
  colorOfSuit,
  sameColorAs,
  euchreRanks,
  allSuits,
  allRanks,
} from './cards';

export type { Seat, Partnership } from './seats';
export {
  seatsClockwise,
  partnershipOfSeat,
  partnerOfSeat,
  leftOfSeat,
} from './seats';

export type { RNG } from './rng';

export type { Deck, DeckCount, Shoe } from './shoe';

export type { Result, RulesError, RulesErrorKind } from './result';

export type {
  GameId,
  HandId,
  Variants,
  Score,
  TricksWon,
  HandsBySeat,
  TrickPlay,
  CompletedTrick,
  HandResult,
  DealingState,
  BiddingRound1State,
  BiddingRound2State,
  DealerDiscardState,
  PlayingState,
  HandCompleteState,
  GameCompleteState,
  GameState,
  OrderUpAction,
  PassAction,
  CallTrumpAction,
  DiscardKittyAction,
  PlayCardAction,
  Action,
} from './euchre';
export { defaults } from './euchre';
