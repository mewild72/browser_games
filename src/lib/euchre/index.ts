/**
 * Public API for the euchre rules engine.
 *
 * Consumers (UI, AI, tests) import from `@/lib/euchre` and never reach
 * into individual files. The engine is pure: no DOM, no Svelte, no IO.
 *
 * Owner: game-rules-engine
 */

// State machine
export {
  createGame,
  applyAction,
  applyActionWithRng,
  advanceToNextHand,
  legalActions,
  isLegal,
} from './engine';
export type { CreateGameOpts } from './engine';

// RNG
export { defaultRng, seededRng } from './rng';

// Deck and shuffle
export { build24CardDeck } from './deck';
export { shuffle } from './shuffle';

// Deal
export { dealHand } from './deal';

// Rank helpers (used by AI strategy)
export {
  effectiveSuit,
  isLeftBower,
  isRightBower,
  isTrump,
  cardStrength,
  compareCards,
} from './ranks';

// Play helpers (used by AI strategy)
export {
  legalPlays,
  isPlayLegal,
  resolveTrick,
  ledSuitOfTrick,
} from './play';

// Scoring
export {
  scoreHand,
  applyHandResult,
  pointsAwardedFromOutcome,
  gameWinner,
  isGameOver,
} from './score';
export type { ScoreHandInput, ScoreHandOutput } from './score';

// Variants
export { assertVariantsValid } from './variants';

// Bidding (mostly internal; openingLeader exported for test/UI use)
export { openingLeader } from './bidding';
