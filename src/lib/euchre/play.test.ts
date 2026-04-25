/**
 * Tests for legal-play detection and trick resolution.
 *
 * Covers common bug 1 (Left Bower follows trump, not native suit) and
 * common bug 2 (Trump led, Left Bower must be played).
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import type { Card, Suit, TrickPlay } from '@/lib/types';
import { legalPlays, isPlayLegal, resolveTrick } from './play';

describe('legalPlays — common bug 1: Left Bower follows trump, not native suit', () => {
  it('trump=hearts, lead=diamonds: J of diamonds is trump and is NOT required', () => {
    const trump: Suit = 'hearts';
    const ledSuit: Suit = 'diamonds';
    const hand: readonly Card[] = [
      { suit: 'diamonds', rank: 'J' }, // Left Bower (trump)
      { suit: 'clubs', rank: '9' },
      { suit: 'spades', rank: 'A' },
    ];
    const legal = legalPlays(hand, trump, ledSuit);
    // Player has no diamonds (J of diamonds is trump, not diamonds), so
    // any card is legal — including the J of diamonds.
    expect(legal.length).toBe(3);
    // The J of diamonds may be played but is not required.
    expect(isPlayLegal(hand, trump, ledSuit, { suit: 'diamonds', rank: 'J' })).toBe(true);
    expect(isPlayLegal(hand, trump, ledSuit, { suit: 'clubs', rank: '9' })).toBe(true);
    expect(isPlayLegal(hand, trump, ledSuit, { suit: 'spades', rank: 'A' })).toBe(true);
  });

  it('trump=spades, lead=clubs: J of clubs is trump and not a club for follow purposes', () => {
    const trump: Suit = 'spades';
    const ledSuit: Suit = 'clubs';
    const hand: readonly Card[] = [
      { suit: 'clubs', rank: 'J' }, // Left Bower (trump)
      { suit: 'hearts', rank: 'A' },
    ];
    // No actual clubs in hand (J of clubs is trump).
    const legal = legalPlays(hand, trump, ledSuit);
    expect(legal.length).toBe(2);
  });

  it('player with native diamonds AND J of diamonds: only the diamonds count for following', () => {
    const trump: Suit = 'hearts';
    const ledSuit: Suit = 'diamonds';
    const hand: readonly Card[] = [
      { suit: 'diamonds', rank: 'J' }, // Left Bower → trump
      { suit: 'diamonds', rank: 'A' }, // Real diamond
      { suit: 'clubs', rank: '9' },
    ];
    const legal = legalPlays(hand, trump, ledSuit);
    // Must follow with the real diamond; J of diamonds is trump, not optional.
    expect(legal.length).toBe(1);
    expect(legal[0]).toEqual({ suit: 'diamonds', rank: 'A' });
  });
});

describe('legalPlays — common bug 2: trump led with Left Bower in hand', () => {
  it('trump=hearts, lead=hearts: J of diamonds is trump and MUST be played', () => {
    const trump: Suit = 'hearts';
    const ledSuit: Suit = 'hearts';
    const hand: readonly Card[] = [
      { suit: 'diamonds', rank: 'J' }, // Left Bower (trump)
      { suit: 'clubs', rank: '9' },
      { suit: 'spades', rank: 'A' },
    ];
    const legal = legalPlays(hand, trump, ledSuit);
    // Player has trump (the Left Bower), so must follow with trump.
    expect(legal.length).toBe(1);
    expect(legal[0]).toEqual({ suit: 'diamonds', rank: 'J' });
    expect(isPlayLegal(hand, trump, ledSuit, { suit: 'clubs', rank: '9' })).toBe(false);
  });

  it('trump=hearts, lead=hearts: with Left Bower + native heart, both are legal', () => {
    const trump: Suit = 'hearts';
    const ledSuit: Suit = 'hearts';
    const hand: readonly Card[] = [
      { suit: 'diamonds', rank: 'J' },
      { suit: 'hearts', rank: '9' },
      { suit: 'clubs', rank: 'A' },
    ];
    const legal = legalPlays(hand, trump, ledSuit);
    expect(legal.length).toBe(2);
    const ranks = legal.map((c) => `${c.suit}-${c.rank}`).sort();
    expect(ranks).toEqual(['diamonds-J', 'hearts-9']);
  });
});

describe('legalPlays basic following', () => {
  it('leading: any card is legal', () => {
    const hand: readonly Card[] = [
      { suit: 'hearts', rank: '9' },
      { suit: 'clubs', rank: 'A' },
    ];
    expect(legalPlays(hand, 'spades', null).length).toBe(2);
  });

  it('cannot follow: any card is legal', () => {
    const hand: readonly Card[] = [
      { suit: 'clubs', rank: '9' },
      { suit: 'spades', rank: 'A' },
    ];
    expect(legalPlays(hand, 'hearts', 'diamonds').length).toBe(2);
  });
});

describe('resolveTrick', () => {
  it('all off-suit, no trump: highest of led suit wins', () => {
    const trump: Suit = 'spades';
    const plays: readonly TrickPlay[] = [
      { seat: 'south', card: { suit: 'hearts', rank: '9' } },
      { seat: 'west', card: { suit: 'hearts', rank: 'A' } },
      { seat: 'north', card: { suit: 'hearts', rank: '10' } },
      { seat: 'east', card: { suit: 'hearts', rank: 'K' } },
    ];
    expect(resolveTrick(plays, trump)).toBe('west');
  });

  it('one trump in trick: trump wins regardless of led-suit ace', () => {
    const trump: Suit = 'spades';
    const plays: readonly TrickPlay[] = [
      { seat: 'south', card: { suit: 'hearts', rank: 'A' } },
      { seat: 'west', card: { suit: 'spades', rank: '9' } },
      { seat: 'north', card: { suit: 'hearts', rank: 'K' } },
      { seat: 'east', card: { suit: 'hearts', rank: 'Q' } },
    ];
    expect(resolveTrick(plays, trump)).toBe('west');
  });

  it('two trumps in trick: higher trump wins; bowers outrank Ace of trump', () => {
    const trump: Suit = 'hearts';
    const plays: readonly TrickPlay[] = [
      { seat: 'south', card: { suit: 'hearts', rank: 'A' } }, // Ace of trump
      { seat: 'west', card: { suit: 'diamonds', rank: 'J' } }, // Left Bower
      { seat: 'north', card: { suit: 'clubs', rank: '9' } },
      { seat: 'east', card: { suit: 'spades', rank: '9' } },
    ];
    expect(resolveTrick(plays, trump)).toBe('west');
  });

  it('Right Bower beats Left Bower', () => {
    const trump: Suit = 'hearts';
    const plays: readonly TrickPlay[] = [
      { seat: 'south', card: { suit: 'diamonds', rank: 'J' } }, // Left
      { seat: 'west', card: { suit: 'hearts', rank: 'J' } }, // Right
    ];
    expect(resolveTrick(plays, trump)).toBe('west');
  });
});
