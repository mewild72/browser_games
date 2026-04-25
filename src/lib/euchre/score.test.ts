/**
 * Tests for hand scoring.
 *
 * Covers common bug 6: lone-march scores 4 (not 2, not 1).
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import { defaults } from '@/lib/types';
import {
  scoreHand,
  pointsAwardedFromOutcome,
  isGameOver,
  gameWinner,
} from './score';

describe('scoreHand — partnership outcomes', () => {
  it('makers take 3 tricks (no alone): 1 point to makers', () => {
    const out = scoreHand({
      maker: 'ns',
      tricksWon: { makers: 3, defenders: 2 },
      alone: false,
    });
    expect(out).toEqual({ winner: 'ns', points: 1, euchred: false });
  });

  it('makers take 4 tricks (no alone): 1 point to makers', () => {
    const out = scoreHand({
      maker: 'ew',
      tricksWon: { makers: 4, defenders: 1 },
      alone: false,
    });
    expect(out).toEqual({ winner: 'ew', points: 1, euchred: false });
  });

  it('makers take 5 tricks (march, no alone): 2 points to makers', () => {
    const out = scoreHand({
      maker: 'ns',
      tricksWon: { makers: 5, defenders: 0 },
      alone: false,
    });
    expect(out).toEqual({ winner: 'ns', points: 2, euchred: false });
  });

  it('common bug 6: lone maker takes 5 tricks → 4 points (not 2, not 1)', () => {
    const out = scoreHand({
      maker: 'ew',
      tricksWon: { makers: 5, defenders: 0 },
      alone: true,
    });
    expect(out).toEqual({ winner: 'ew', points: 4, euchred: false });
  });

  it('lone maker takes 3 or 4 tricks: 1 point', () => {
    expect(
      scoreHand({ maker: 'ns', tricksWon: { makers: 3, defenders: 2 }, alone: true }),
    ).toEqual({ winner: 'ns', points: 1, euchred: false });
    expect(
      scoreHand({ maker: 'ns', tricksWon: { makers: 4, defenders: 1 }, alone: true }),
    ).toEqual({ winner: 'ns', points: 1, euchred: false });
  });

  it('makers euchred (0 tricks): defenders get 2', () => {
    const out = scoreHand({
      maker: 'ns',
      tricksWon: { makers: 0, defenders: 5 },
      alone: false,
    });
    expect(out).toEqual({ winner: 'ew', points: 2, euchred: true });
  });

  it('makers euchred (2 tricks): defenders get 2', () => {
    const out = scoreHand({
      maker: 'ew',
      tricksWon: { makers: 2, defenders: 3 },
      alone: false,
    });
    expect(out).toEqual({ winner: 'ns', points: 2, euchred: true });
  });

  it('lone maker euchred: still 2 to defenders', () => {
    const out = scoreHand({
      maker: 'ew',
      tricksWon: { makers: 1, defenders: 4 },
      alone: true,
    });
    expect(out).toEqual({ winner: 'ns', points: 2, euchred: true });
  });
});

describe('pointsAwardedFromOutcome', () => {
  it('routes points to ns when ns wins', () => {
    expect(
      pointsAwardedFromOutcome({ winner: 'ns', points: 2, euchred: false }),
    ).toEqual({ ns: 2, ew: 0 });
  });
  it('routes points to ew when ew wins', () => {
    expect(
      pointsAwardedFromOutcome({ winner: 'ew', points: 4, euchred: false }),
    ).toEqual({ ns: 0, ew: 4 });
  });
});

describe('game-end checks', () => {
  it('isGameOver false below threshold', () => {
    expect(isGameOver({ ns: 9, ew: 9 }, defaults)).toBe(false);
  });
  it('isGameOver true at threshold', () => {
    expect(isGameOver({ ns: 10, ew: 6 }, defaults)).toBe(true);
    expect(gameWinner({ ns: 10, ew: 6 }, defaults)).toBe('ns');
  });
  it('respects pointsToWin variant', () => {
    const v = { ...defaults, pointsToWin: 5 as const };
    expect(isGameOver({ ns: 5, ew: 1 }, v)).toBe(true);
    expect(gameWinner({ ns: 5, ew: 1 }, v)).toBe('ns');
  });
});
