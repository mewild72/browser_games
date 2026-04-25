/**
 * Result and error types for the rules engine.
 *
 * The rules engine never throws on illegal actions. It returns a `Result`
 * so consumers (UI, AI, tests) can branch deterministically. Throws are
 * reserved for true programmer errors (impossible states reached).
 *
 * Owner: typescript-architect
 */

/**
 * Discriminated success/failure. Narrowing on `result.ok` reveals either
 * `result.value` (T) or `result.error` (E).
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Tagged categories of rule violations the engine can return.
 *
 * Add new kinds here as variants are implemented. Each kind should have a
 * matching test in the rules-engine suite.
 */
export type RulesErrorKind =
  | 'illegal-action'
  | 'wrong-phase'
  | 'wrong-seat'
  | 'must-follow-suit'
  | 'card-not-in-hand'
  | 'suit-already-rejected'
  | 'going-alone-not-allowed'
  | 'invalid-trump-suit'
  | 'unknown';

/** Standard error payload returned by the rules engine. */
export type RulesError = {
  readonly kind: RulesErrorKind;
  readonly message: string;
};
