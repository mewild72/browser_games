/**
 * Calibration tournament: Medium vs Easy.
 *
 * Plays 200 games with NS = Medium and EW = Easy with a fixed RNG seed.
 * Asserts:
 *   - Both bots return only legal actions across the entire run
 *     (assertLegal: true)
 *   - Medium wins more than 55% of games
 *
 * Note: this test is intentionally moderate-length. We chose 200 games
 * because the variance with a 55% threshold is comfortably below the
 * margin (Medium vs Easy beats this gap by a wide margin in practice).
 *
 * Owner: ai-strategy-expert
 */

import { describe, it, expect } from 'vitest';
import { easyBot, mediumBot, tournamentWithSeed } from './index';

describe('Calibration tournament: Medium vs Easy', () => {
  it('Medium wins > 55% over 200 seeded games', async () => {
    const result = await tournamentWithSeed({
      gameCount: 200,
      players: [
        mediumBot('M-N'),
        easyBot('E-E'),
        mediumBot('M-S'),
        easyBot('E-W'),
      ],
      seed: 20260425,
      assertLegal: true,
    });
    expect(result.totalGames).toBe(200);
    const mediumWinRate = result.wins.ns / result.totalGames;
    expect(mediumWinRate).toBeGreaterThan(0.55);
    // Sanity floors so a regression to "no calls ever" or runaway games
    // surfaces here too.
    expect(result.avgHandsPerGame).toBeGreaterThan(3);
    expect(result.avgHandsPerGame).toBeLessThan(50);
    // Reference output for ai-calibration.md — log via stderr-like channel
    // (test runners surface it on failure; we don't assert exact values).
    // eslint-disable-next-line no-console
    console.log(
      `[tournament] Medium vs Easy (seed=20260425, n=200): ` +
        `M=${(mediumWinRate * 100).toFixed(1)}% ` +
        `E=${((1 - mediumWinRate) * 100).toFixed(1)}% ` +
        `hands/game=${result.avgHandsPerGame.toFixed(2)} ` +
        `euchreRate=${(result.euchreRate * 100).toFixed(1)}% ` +
        `aloneCallRate=${(result.alongCallRate * 100).toFixed(1)}% ` +
        `aloneSuccess=${(result.aloneSuccessRate * 100).toFixed(1)}%`,
    );
  }, 30_000);
});
