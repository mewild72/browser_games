/**
 * Hand scoring and game-end check.
 *
 * Scoring table (from `skills/euchre-rules.md`):
 *   - Makers 3 or 4 tricks: 1 point to makers
 *   - Makers all 5 (march):  2 points to makers (or 4 if the maker went alone)
 *   - Lone maker 3 or 4:     1 point to maker side
 *   - Lone maker all 5:      4 points to maker side
 *   - Makers fewer than 3:   2 points to defenders ("euchred")
 *
 * Owner: game-rules-engine
 */

import type {
  HandResult,
  Partnership,
  Score,
  TricksWon,
  Variants,
} from '@/lib/types';

/**
 * Inputs needed to score one completed hand.
 */
export type ScoreHandInput = {
  readonly maker: Partnership;
  readonly tricksWon: TricksWon;
  readonly alone: boolean;
};

/**
 * Output: which partnership earned points and how many.
 */
export type ScoreHandOutput = {
  readonly winner: Partnership;
  readonly points: number;
  readonly euchred: boolean;
};

/**
 * Score a single completed hand. The five tricks have already been
 * tallied into `tricksWon`. Returns who scored and how many points.
 */
export function scoreHand(input: ScoreHandInput): ScoreHandOutput {
  const { maker, tricksWon, alone } = input;
  const makerTricks = tricksWon.makers;
  const defenderPartnership: Partnership = maker === 'ns' ? 'ew' : 'ns';

  if (makerTricks < 3) {
    // Euchred: defenders score 2 (regardless of maker's alone declaration).
    return { winner: defenderPartnership, points: 2, euchred: true };
  }

  if (makerTricks === 5) {
    // March / lone-march.
    return { winner: maker, points: alone ? 4 : 2, euchred: false };
  }

  // 3 or 4 tricks: 1 point either way (alone or not).
  return { winner: maker, points: 1, euchred: false };
}

/**
 * Apply a hand result's points to the running score and return the new
 * score. Pure: input is not mutated.
 */
export function applyHandResult(score: Score, result: HandResult): Score {
  return {
    ns: score.ns + result.pointsAwarded.ns,
    ew: score.ew + result.pointsAwarded.ew,
  };
}

/**
 * Build a `pointsAwarded` Score object from a `scoreHand` output.
 */
export function pointsAwardedFromOutcome(out: ScoreHandOutput): Score {
  if (out.winner === 'ns') return { ns: out.points, ew: 0 };
  return { ns: 0, ew: out.points };
}

/**
 * True iff a partnership has reached the points-to-win threshold.
 *
 * Returns the winning partnership or `null` if the game is not over.
 */
export function gameWinner(score: Score, variants: Variants): Partnership | null {
  if (score.ns >= variants.pointsToWin && score.ns > score.ew) return 'ns';
  if (score.ew >= variants.pointsToWin && score.ew > score.ns) return 'ew';
  // Both at or above and equal — impossible in euchre because a hand
  // awards at most one side, but guard anyway for variant safety.
  if (score.ns >= variants.pointsToWin) return 'ns';
  if (score.ew >= variants.pointsToWin) return 'ew';
  return null;
}

/**
 * True iff the game is over.
 */
export function isGameOver(score: Score, variants: Variants): boolean {
  return gameWinner(score, variants) !== null;
}
