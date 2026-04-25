/**
 * Tests for deck construction, shuffle, and dealing.
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import { build24CardDeck } from './deck';
import { shuffle } from './shuffle';
import { dealHand } from './deal';
import { seededRng } from './rng';

describe('build24CardDeck', () => {
  it('produces exactly 24 unique (suit, rank) cards', () => {
    const deck = build24CardDeck();
    expect(deck.length).toBe(24);
    const ids = new Set(deck.map((c) => `${c.suit}-${c.rank}`));
    expect(ids.size).toBe(24);
  });

  it('uses only the 6 euchre ranks (9-A)', () => {
    const deck = build24CardDeck();
    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks).toEqual(new Set(['9', '10', 'J', 'Q', 'K', 'A']));
  });
});

describe('shuffle', () => {
  it('preserves length and contents', () => {
    const deck = build24CardDeck();
    const shuffled = shuffle(deck, seededRng(42));
    expect(shuffled.length).toBe(deck.length);
    const original = new Set(deck.map((c) => `${c.suit}-${c.rank}`));
    const after = new Set(shuffled.map((c) => `${c.suit}-${c.rank}`));
    expect(after).toEqual(original);
  });

  it('is deterministic given the same seed', () => {
    const deck = build24CardDeck();
    const a = shuffle(deck, seededRng(123));
    const b = shuffle(deck, seededRng(123));
    expect(a).toEqual(b);
  });

  it('produces different orders for different seeds', () => {
    const deck = build24CardDeck();
    const a = shuffle(deck, seededRng(1));
    const b = shuffle(deck, seededRng(2));
    expect(a).not.toEqual(b);
  });

  it('does not mutate the input', () => {
    const deck = build24CardDeck();
    const before = deck.slice();
    shuffle(deck, seededRng(7));
    expect(deck).toEqual(before);
  });
});

describe('dealHand', () => {
  it('gives 5 cards to each seat and 4 to the kitty (1 turned + 3 face-down)', () => {
    const { hands, kitty, turnedCard } = dealHand(seededRng(99), 'south');
    expect(hands.north.length).toBe(5);
    expect(hands.east.length).toBe(5);
    expect(hands.south.length).toBe(5);
    expect(hands.west.length).toBe(5);
    expect(kitty.length).toBe(3);
    expect(turnedCard).toBeDefined();

    const all = [
      ...hands.north,
      ...hands.east,
      ...hands.south,
      ...hands.west,
      ...kitty,
      turnedCard,
    ];
    const ids = new Set(all.map((c) => `${c.suit}-${c.rank}`));
    // 24 unique cards, all accounted for, no duplicates.
    expect(all.length).toBe(24);
    expect(ids.size).toBe(24);
  });

  it('is deterministic given the same seed and dealer', () => {
    const a = dealHand(seededRng(11), 'east');
    const b = dealHand(seededRng(11), 'east');
    expect(a).toEqual(b);
  });
});
