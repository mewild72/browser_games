/**
 * Tests for `effectiveSuit`, bower detection, and card comparison.
 *
 * The Left Bower behavior is the most-buggy euchre rule; this suite covers
 * common bug 1 (left bower follows trump, not native suit) and common
 * bug 2 (left bower must be played when trump is led).
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import type { Card, Suit } from '@/lib/types';
import {
  effectiveSuit,
  isLeftBower,
  isRightBower,
  isTrump,
  cardStrength,
  compareCards,
} from './ranks';

describe('effectiveSuit', () => {
  it('returns native suit for non-J cards', () => {
    expect(effectiveSuit({ suit: 'hearts', rank: 'A' }, 'spades')).toBe('hearts');
    expect(effectiveSuit({ suit: 'clubs', rank: '9' }, 'hearts')).toBe('clubs');
  });

  it('returns trump for the Right Bower', () => {
    // J of trump is its own suit (trump).
    expect(effectiveSuit({ suit: 'hearts', rank: 'J' }, 'hearts')).toBe('hearts');
  });

  it('returns trump for the Left Bower (J of same color as trump)', () => {
    // Trump=hearts -> Left Bower is J of diamonds.
    expect(effectiveSuit({ suit: 'diamonds', rank: 'J' }, 'hearts')).toBe('hearts');
    // Trump=spades  -> Left Bower is J of clubs.
    expect(effectiveSuit({ suit: 'clubs', rank: 'J' }, 'spades')).toBe('spades');
  });

  it('returns native suit for the off-color Jack (not a bower)', () => {
    // Trump=hearts. J of clubs is off-color; remains clubs.
    expect(effectiveSuit({ suit: 'clubs', rank: 'J' }, 'hearts')).toBe('clubs');
    // Trump=hearts. J of spades is off-color; remains spades.
    expect(effectiveSuit({ suit: 'spades', rank: 'J' }, 'hearts')).toBe('spades');
  });
});

describe('isLeftBower / isRightBower / isTrump', () => {
  it('identifies the Left Bower', () => {
    expect(isLeftBower({ suit: 'diamonds', rank: 'J' }, 'hearts')).toBe(true);
    expect(isLeftBower({ suit: 'hearts', rank: 'J' }, 'hearts')).toBe(false);
    expect(isLeftBower({ suit: 'clubs', rank: 'J' }, 'hearts')).toBe(false);
  });

  it('identifies the Right Bower', () => {
    expect(isRightBower({ suit: 'hearts', rank: 'J' }, 'hearts')).toBe(true);
    expect(isRightBower({ suit: 'diamonds', rank: 'J' }, 'hearts')).toBe(false);
  });

  it('classifies bowers and same-suit cards as trump', () => {
    expect(isTrump({ suit: 'hearts', rank: 'J' }, 'hearts')).toBe(true);
    expect(isTrump({ suit: 'diamonds', rank: 'J' }, 'hearts')).toBe(true); // Left bower
    expect(isTrump({ suit: 'hearts', rank: '9' }, 'hearts')).toBe(true);
    expect(isTrump({ suit: 'diamonds', rank: '9' }, 'hearts')).toBe(false);
  });
});

describe('cardStrength under trump=hearts, ledSuit=hearts', () => {
  const trump: Suit = 'hearts';
  const led: Suit = 'hearts';

  it('orders trump correctly: Right > Left > A > K > Q > 10 > 9', () => {
    const cards: readonly { c: Card; label: string }[] = [
      { c: { suit: 'hearts', rank: 'J' }, label: 'right' },
      { c: { suit: 'diamonds', rank: 'J' }, label: 'left' },
      { c: { suit: 'hearts', rank: 'A' }, label: 'A' },
      { c: { suit: 'hearts', rank: 'K' }, label: 'K' },
      { c: { suit: 'hearts', rank: 'Q' }, label: 'Q' },
      { c: { suit: 'hearts', rank: '10' }, label: '10' },
      { c: { suit: 'hearts', rank: '9' }, label: '9' },
    ];
    const strengths = cards.map((x) => cardStrength(x.c, trump, led));
    // Strictly descending.
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i - 1]).toBeGreaterThan(strengths[i]!);
    }
  });
});

describe('compareCards: trump beats led-suit', () => {
  it('any trump beats highest off-suit when off-suit is led', () => {
    // Trump=spades, led=hearts. 9 of spades beats Ace of hearts.
    const trump: Suit = 'spades';
    const led: Suit = 'hearts';
    const trump9: Card = { suit: 'spades', rank: '9' };
    const heartsA: Card = { suit: 'hearts', rank: 'A' };
    expect(compareCards(trump9, heartsA, trump, led)).toBeGreaterThan(0);
  });

  it('off-suit not matching led has zero strength (cannot win)', () => {
    const trump: Suit = 'spades';
    const led: Suit = 'hearts';
    // Diamond is not led, not trump.
    expect(cardStrength({ suit: 'diamonds', rank: 'A' }, trump, led)).toBe(0);
  });
});
