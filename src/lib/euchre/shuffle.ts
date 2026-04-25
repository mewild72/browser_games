/**
 * Pure Fisher-Yates shuffle.
 *
 * Returns a new array; never mutates the input. Randomness flows through
 * the injected RNG so tests can produce deterministic orderings.
 *
 * Owner: game-rules-engine
 */

import type { RNG } from '@/lib/types';

/**
 * Fisher-Yates shuffle. O(n) time, O(n) extra space. Pure: input array is
 * not mutated. The RNG is consumed exactly `length - 1` times.
 */
export function shuffle<T>(deck: readonly T[], rng: RNG): T[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    // rng.next() returns [0,1); scale to [0, i+1) to pick a swap target.
    const j = Math.floor(rng.next() * (i + 1));
    // We only iterate from length-1 down to 1, so out[i] is always defined;
    // out[j] is also defined because j is in [0, i].
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
