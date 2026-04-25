/**
 * Hard bot — STUB.
 *
 * The Hard tier is reserved for Information-Set Monte Carlo Tree Search
 * (IS-MCTS) with hidden-card sampling:
 *
 *   For each decision:
 *     1. Sample N hidden-card distributions consistent with public info
 *        (cards played, voids inferred from `inferredVoids`).
 *     2. For each sample, run a rollout (random or weak-policy) to the
 *        end of the hand.
 *     3. Aggregate per-action expected value across samples.
 *     4. Pick the highest-EV action.
 *
 * This requires a determinized search tree, time-budgeted iteration, and
 * a "policy" for opponent moves during rollouts. It is a non-trivial
 * implementation — deferred to a follow-up phase per the project plan.
 *
 * Design decision (recorded here):
 *   The factory returns a Bot whose `decide()` REJECTS with an Error.
 *   We chose rejection over a marker action so callers don't accidentally
 *   silently fall through to a degenerate move. The game loop must
 *   explicitly decide what to do when Hard is selected and the stub is
 *   in place — surfacing that call site loudly is the safe default.
 *
 * To unblock UI development against Hard before MCTS lands, callers can
 * fall back to `mediumBot()` and label it "Hard (preview)".
 *
 * Reference for IS-MCTS:
 *   https://www.aifactory.co.uk/newsletter/2013_01_reduce_burden.htm
 *
 * Owner: ai-strategy-expert
 */

import type { Bot } from './types';

/** Factory for the Hard-tier bot. STUB — not yet implemented. */
export function hardBot(name = 'Hard'): Bot {
  return {
    name,
    difficulty: 'hard',
    decide(): Promise<never> {
      return Promise.reject(
        new Error(
          'hard tier not implemented — IS-MCTS deferred. Use mediumBot() in the meantime.',
        ),
      );
    },
  };
}
