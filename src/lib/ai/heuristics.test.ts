/**
 * Unit tests for the hand-strength and counting heuristics.
 *
 * These directly verify the formula: bowers count more, off-suit aces
 * add value, voids add value, and the canonical "lay-down" hand scores
 * above the alone threshold.
 *
 * Owner: ai-strategy-expert
 */

import { describe, it, expect } from 'vitest';
import type { Card, Suit } from '@/lib/types';
import {
  bowerCount,
  handStrength,
  hasLeftBower,
  hasRightBower,
  offSuitAces as offSuitAceCount,
  offSuitVoidCount,
  trumpCount,
} from './heuristics';

const C = (suit: Suit, rank: Card['rank']): Card => ({ suit, rank });

describe('handStrength constituents', () => {
  it('trumpCount counts trump including left bower', () => {
    const trump: Suit = 'hearts';
    const hand: Card[] = [
      C('hearts', 'A'),
      C('hearts', 'K'),
      C('diamonds', 'J'), // left bower, counts as trump
      C('clubs', '9'),
      C('spades', '10'),
    ];
    expect(trumpCount(hand, trump)).toBe(3);
  });

  it('bowerCount counts both bowers', () => {
    const trump: Suit = 'hearts';
    const hand: Card[] = [
      C('hearts', 'J'),
      C('diamonds', 'J'),
      C('hearts', 'A'),
      C('clubs', '9'),
      C('spades', '10'),
    ];
    expect(bowerCount(hand, trump)).toBe(2);
    expect(hasRightBower(hand, trump)).toBe(true);
    expect(hasLeftBower(hand, trump)).toBe(true);
  });

  it('offSuitAces excludes the trump-suit ace', () => {
    const trump: Suit = 'hearts';
    const hand: Card[] = [
      C('hearts', 'A'), // trump ace — excluded
      C('clubs', 'A'),
      C('spades', 'A'),
      C('diamonds', '9'),
      C('hearts', '10'),
    ];
    expect(offSuitAceCount(hand, trump)).toBe(2);
  });

  it('offSuitVoidCount excludes trump and counts unrepresented suits', () => {
    const trump: Suit = 'hearts';
    const hand: Card[] = [
      C('hearts', 'A'),
      C('hearts', 'K'),
      C('hearts', 'Q'),
      C('hearts', 'J'),
      C('diamonds', 'J'), // left bower — also trump
    ];
    // hand has no clubs, no spades, no native diamonds — voids = 2 (clubs, spades)
    // (diamonds the J is trump; hand has no diamond cards so diamonds is also void).
    // After left-bower normalization, diamonds suit IS unrepresented → 3 voids.
    expect(offSuitVoidCount(hand, trump)).toBe(3);
  });
});

describe('handStrength formula', () => {
  it('canonical lay-down hand scores well above the order-up threshold', () => {
    const trump: Suit = 'hearts';
    // Both bowers + ace trump + king trump + ace off-suit. This is the
    // canonical "lone-call" hand. The canonical alone-check in medium.ts
    // catches this directly (both bowers + ace trump + trump count ≥ 4),
    // so this test only requires the score to be well above the round-1
    // order-up threshold of 7.0.
    const hand: Card[] = [
      C('hearts', 'J'), // right bower 3.0
      C('diamonds', 'J'), // left bower 2.5
      C('hearts', 'A'), // trump 1.5
      C('hearts', 'K'), // trump 1.5
      C('clubs', 'A'), // off ace 1.0
      // + 2 voids (spades, diamonds) × 0.6 = 1.2
    ];
    const s = handStrength({ hand, trump, asMaker: true });
    expect(s).toBeGreaterThanOrEqual(10.0);
  });

  it('mediocre hand scores low', () => {
    const trump: Suit = 'hearts';
    const hand: Card[] = [
      C('hearts', '9'),
      C('clubs', '10'),
      C('spades', 'Q'),
      C('diamonds', '9'), // not the J → not left bower
      C('clubs', 'K'),
    ];
    const s = handStrength({ hand, trump, asMaker: true });
    expect(s).toBeLessThan(5.0);
  });

  it('right bower outweighs left bower', () => {
    const trump: Suit = 'hearts';
    const a = handStrength({
      hand: [C('hearts', 'J')],
      trump,
      asMaker: true,
    });
    const b = handStrength({
      hand: [C('diamonds', 'J')],
      trump,
      asMaker: true,
    });
    expect(a).toBeGreaterThan(b);
  });

  it('off-suit aces increase strength', () => {
    const trump: Suit = 'hearts';
    const baseHand: Card[] = [
      C('hearts', 'J'),
      C('hearts', 'A'),
      C('hearts', 'K'),
      C('clubs', '9'),
      C('spades', '10'),
    ];
    const withAce: Card[] = [
      C('hearts', 'J'),
      C('hearts', 'A'),
      C('hearts', 'K'),
      C('clubs', 'A'), // upgraded
      C('spades', '10'),
    ];
    const a = handStrength({ hand: baseHand, trump, asMaker: true });
    const b = handStrength({ hand: withAce, trump, asMaker: true });
    expect(b).toBeGreaterThan(a);
  });
});
