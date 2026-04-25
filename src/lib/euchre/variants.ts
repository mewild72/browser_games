/**
 * Variant flag guards.
 *
 * The MVP supports only a subset of the variant fields declared in the
 * type layer. This module fails fast if a caller hands the engine a
 * variant configuration the engine does not yet implement.
 *
 * Owner: game-rules-engine
 */

import type { Variants } from '@/lib/types';

/**
 * Validate the variant configuration. Throws (programmer error, not a
 * rules violation) when the configuration uses a flag value the MVP does
 * not yet implement.
 *
 * Returns `true` on success so the function can be used in assertions.
 */
export function assertVariantsValid(variants: Variants): true {
  if (variants.deckSize !== 24) {
    throw new Error(
      `Unsupported variant: deckSize=${variants.deckSize}. MVP supports only 24-card deck.`,
    );
  }
  if (variants.joker !== 'none') {
    throw new Error(
      `Unsupported variant: joker=${variants.joker}. MVP supports only joker='none'.`,
    );
  }
  if (variants.noTrump) {
    throw new Error(`Unsupported variant: noTrump=true is not implemented in MVP.`);
  }
  if (variants.screwTheDealer) {
    throw new Error(`Unsupported variant: screwTheDealer=true is not implemented in MVP.`);
  }
  // pointsToWin: 5 / 7 / 10 are all supported (engine simply checks score against the target).
  // stickTheDealer: ON or OFF both supported.
  // allowGoingAlone: ON or OFF both supported.
  return true;
}
