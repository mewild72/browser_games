/**
 * AI-internal types for the bot layer.
 *
 * These types are intentionally NOT re-exported through `@/lib/types`.
 * The global type layer is owned by typescript-architect and represents
 * the contract between rules engine, UI, and storage. The Bot interface
 * is an implementation detail of `src/lib/ai/`; consumers (the Svelte
 * game loop, tests) reach in via `@/lib/ai`.
 *
 * Owner: ai-strategy-expert
 */

import type { Action, GameState, RNG, Seat } from '@/lib/types';

/** Difficulty tiers. The user picks one tier per game in the MVP. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * The contract every bot factory returns.
 *
 * `decide` is async even for the synchronous Easy/Medium tiers because the
 * Hard tier (IS-MCTS) needs time-slicing and the surrounding game loop
 * should not branch on tier when calling the bot. The returned `Action`
 * MUST be a member of `legalActions(state, seat)` — verified in tests.
 *
 * Bots are stateless across calls. Any "memory" (card-counting, void
 * inference) is computed fresh each call from the public game record
 * carried in `state` (`completedTricks`, `currentTrick`). This keeps bots
 * trivially testable and replay-deterministic.
 */
export interface Bot {
  readonly name: string;
  readonly difficulty: Difficulty;
  decide(state: GameState, seat: Seat, rng: RNG): Promise<Action>;
}
