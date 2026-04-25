/**
 * RNG implementations for the euchre engine.
 *
 * `defaultRng()` wraps `Math.random` for production use.
 * `seededRng(seed)` is a deterministic mulberry32 PRNG used by tests and
 * for replay. Both satisfy the `RNG` contract from `@/lib/types`.
 *
 * Owner: game-rules-engine
 */

import type { RNG } from '@/lib/types';

/**
 * Production RNG. Wraps `Math.random` so callers always go through the
 * injected RNG abstraction; the engine itself never touches `Math.random`.
 */
export function defaultRng(): RNG {
  return {
    next(): number {
      return Math.random();
    },
  };
}

/**
 * Deterministic seeded RNG (mulberry32). Given the same seed, produces the
 * same sequence of floats in `[0, 1)`. Used by tests and replay.
 *
 * Reference: https://stackoverflow.com/a/47593316 — mulberry32 is a small,
 * well-distributed 32-bit PRNG suitable for non-cryptographic use.
 */
export function seededRng(seed: number): RNG {
  // Normalize to a 32-bit unsigned integer state.
  let state = (seed | 0) >>> 0;
  // If the seed is 0 mulberry32 still works, but bias it slightly so a
  // 0 seed produces a non-degenerate first draw.
  if (state === 0) {
    state = 0x9e3779b9;
  }
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
