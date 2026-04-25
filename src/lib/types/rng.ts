/**
 * RNG abstraction.
 *
 * The shoe and rules engine never call `Math.random` directly. Instead they
 * accept an `RNG` so tests can inject a seeded deterministic source and the
 * production build can wrap `Math.random` (or `crypto.getRandomValues`) in
 * the same shape.
 *
 * Owner: typescript-architect
 */

/**
 * Minimal random-number-generator contract.
 *
 * `next()` returns a uniformly-distributed float in `[0, 1)`, matching the
 * semantics of `Math.random()`.
 */
export type RNG = {
  next(): number;
};
