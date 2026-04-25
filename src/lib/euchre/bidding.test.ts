/**
 * Tests for bidding-round transitions and stick-the-dealer.
 *
 * Covers common bug 4 (stick-the-dealer cannot call the rejected suit)
 * and common bug 5 (dealer's discard timing).
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import type {
  BiddingRound1State,
  BiddingRound2State,
  GameState,
  Variants,
} from '@/lib/types';
import { defaults, leftOfSeat } from '@/lib/types';
import { applyAction, createGame } from './engine';
import { seededRng } from './rng';

/**
 * Drive a fresh game from createGame to bidding-round-1 with a specific
 * dealer so tests can reason about turn order.
 */
function freshRound1(seed: number, variants: Variants = defaults): BiddingRound1State {
  const state = createGame({
    rng: seededRng(seed),
    variants,
    firstDealer: 'south',
  });
  if (state.phase !== 'bidding-round-1') {
    throw new Error('expected bidding-round-1');
  }
  return state;
}

describe('bidding round 1', () => {
  it('starts with the seat to the dealer\'s left to act', () => {
    const state = freshRound1(1);
    expect(state.dealer).toBe('south');
    expect(state.turn).toBe('west');
  });

  it('advances turn clockwise on pass', () => {
    let state: GameState = freshRound1(2);
    if (state.phase !== 'bidding-round-1') throw new Error();
    const result = applyAction(state, { type: 'pass', seat: 'west' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    state = result.value;
    if (state.phase !== 'bidding-round-1') throw new Error();
    expect(state.turn).toBe('north');
    expect(state.passes).toBe(1);
  });

  it('rejects an action by the wrong seat', () => {
    const state = freshRound1(3);
    const r = applyAction(state, { type: 'pass', seat: 'south' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('wrong-seat');
    }
  });

  it('round 1 -> round 2 after four passes', () => {
    let state: GameState = freshRound1(4);
    const seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of seats) {
      const r = applyAction(state, { type: 'pass', seat });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.value;
    }
    expect(state.phase).toBe('bidding-round-2');
    if (state.phase !== 'bidding-round-2') return;
    expect(state.turn).toBe('west');
    expect(state.rejectedSuit).toBe(state.turnedCard.suit);
  });

  it('orderUp transitions to dealer-discard with trump set', () => {
    const state = freshRound1(5);
    const r = applyAction(state, { type: 'orderUp', seat: 'west', alone: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.phase).toBe('dealer-discard');
    if (r.value.phase !== 'dealer-discard') return;
    expect(r.value.trump).toBe(state.turnedCard.suit);
    expect(r.value.orderedUpBy).toBe('west');
    expect(r.value.maker).toBe('ew');
    expect(r.value.alone).toBe(false);
    // Dealer should now have 6 cards (turned card added).
    expect(r.value.hands[r.value.dealer].length).toBe(6);
  });
});

describe('common bug 5: dealer\'s discard timing', () => {
  it('after orderUp, dealer must discard before play begins', () => {
    const state = freshRound1(6);
    // West orders up.
    const r1 = applyAction(state, { type: 'orderUp', seat: 'west', alone: false });
    if (!r1.ok || r1.value.phase !== 'dealer-discard') {
      throw new Error('expected dealer-discard');
    }
    const dd = r1.value;
    // Try to play a card before discarding — must be rejected.
    const south = dd.hands.south;
    const someCard = south[0]!;
    const playEarly = applyAction(dd, {
      type: 'playCard',
      seat: 'west',
      card: someCard,
    });
    expect(playEarly.ok).toBe(false);
    if (!playEarly.ok) {
      expect(playEarly.error.kind).toBe('wrong-phase');
    }
    // Now perform the dealer's discard.
    const dealerHand = dd.hands[dd.dealer];
    const discard = dealerHand[0]!;
    const r2 = applyAction(dd, { type: 'discardKitty', seat: dd.dealer, card: discard });
    expect(r2.ok).toBe(true);
    if (!r2.ok || r2.value.phase !== 'playing') return;
    expect(r2.value.hands[r2.value.dealer].length).toBe(5);
    // Opening lead is to the dealer's left (no lone hand).
    expect(r2.value.trickLeader).toBe(leftOfSeat[r2.value.dealer]);
    expect(r2.value.turn).toBe(r2.value.trickLeader);
  });

  it('rejects a discard by a non-dealer seat', () => {
    const state = freshRound1(7);
    const r1 = applyAction(state, { type: 'orderUp', seat: 'west', alone: false });
    if (!r1.ok || r1.value.phase !== 'dealer-discard') throw new Error();
    const dd = r1.value;
    // Dealer is south in this fixture; pick a non-dealer seat.
    const card = dd.hands.north[0]!;
    const r = applyAction(dd, { type: 'discardKitty', seat: 'north', card });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('wrong-seat');
  });
});

describe('common bug 4: stick-the-dealer with same-suit attempt', () => {
  it('dealer in round 2 (stuck) cannot call the rejected suit', () => {
    // STD on; pass through round 1, then pass three times in round 2 to
    // get to the dealer.
    let state: GameState = freshRound1(8);
    if (state.phase !== 'bidding-round-1') throw new Error();
    const turnedSuit = state.turnedCard.suit;
    const r1Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r1Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    const r2Seats = ['west', 'north', 'east'] as const;
    for (const seat of r2Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    expect(state.turn).toBe('south'); // dealer
    // Now the dealer cannot pass (STD on) and cannot call the turned suit.
    const reject = applyAction(state, {
      type: 'callTrump',
      seat: 'south',
      suit: turnedSuit,
      alone: false,
    });
    expect(reject.ok).toBe(false);
    if (!reject.ok) {
      expect(reject.error.kind).toBe('suit-already-rejected');
    }
    // Dealer also cannot pass.
    const passReject = applyAction(state, { type: 'pass', seat: 'south' });
    expect(passReject.ok).toBe(false);
    // Dealer CAN call any other suit and the call is recorded as 'stick'.
    const allSuits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const validSuit = allSuits.find((s) => s !== turnedSuit)!;
    const ok = applyAction(state, {
      type: 'callTrump',
      seat: 'south',
      suit: validSuit,
      alone: false,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    if (ok.value.phase !== 'playing') throw new Error();
    expect(ok.value.orderedUpInRound).toBe('stick');
    expect(ok.value.trump).toBe(validSuit);
  });

  it('with stick-the-dealer OFF, all four passing in round 2 forces a re-deal', () => {
    const variants: Variants = { ...defaults, stickTheDealer: false };
    let state: GameState = freshRound1(9, variants);
    const r1Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r1Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    const r2Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r2Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error('pass should be legal in round 2 with STD off');
      state = r.value;
    }
    // After all four pass, engine re-deals automatically with the next dealer.
    expect(state.phase).toBe('bidding-round-1');
    if (state.phase !== 'bidding-round-1') return;
    expect(state.dealer).toBe('west'); // left of original south
  });
});

describe('round 2 callTrump', () => {
  it('non-dealer in round 2 can call any non-rejected suit', () => {
    let state: GameState = freshRound1(10);
    if (state.phase !== 'bidding-round-1') throw new Error();
    const turnedSuit = state.turnedCard.suit;
    const r1Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r1Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    expect(state.turn).toBe('west');
    // West tries to call the rejected suit -> reject.
    const bad = applyAction(state, {
      type: 'callTrump',
      seat: 'west',
      suit: turnedSuit,
      alone: false,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe('suit-already-rejected');
    // West calls another suit.
    const allSuits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const ok = applyAction(state, {
      type: 'callTrump',
      seat: 'west',
      suit: allSuits.find((s) => s !== turnedSuit)!,
      alone: false,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    if (ok.value.phase !== 'playing') throw new Error();
    expect(ok.value.orderedUpInRound).toBe(2);
  });
});

describe('lone-hand opening lead — common bug 3 / 7', () => {
  it('common bug 3: lone caller is east; partner west would lead -> lead passes to north', () => {
    // Need east to be a non-dealer (we want east to call alone in round 2).
    // Set up: dealer south, turned suit = whatever; everyone passes round 1;
    // west passes round 2; north passes round 2; east calls alone round 2.
    // The maker east's partner is west; the seat to the dealer's (south) left
    // is west. That seat is sitting out, so lead passes to north.
    let state: GameState = freshRound1(20);
    if (state.phase !== 'bidding-round-1') throw new Error();
    const turnedSuit = state.turnedCard.suit;
    const r1Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r1Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    // West passes, north passes. Then east calls alone.
    let r = applyAction(state, { type: 'pass', seat: 'west' });
    if (!r.ok) throw new Error();
    state = r.value;
    r = applyAction(state, { type: 'pass', seat: 'north' });
    if (!r.ok) throw new Error();
    state = r.value;
    if (state.phase !== 'bidding-round-2') throw new Error();
    expect(state.turn).toBe('east');
    const allSuits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const callSuit = allSuits.find((s) => s !== turnedSuit)!;
    r = applyAction(state, {
      type: 'callTrump',
      seat: 'east',
      suit: callSuit,
      alone: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.value.phase !== 'playing') throw new Error();
    // West (maker's partner) is sitting out and would have led; lead passes to north.
    expect(r.value.sittingOut).toBe('west');
    expect(r.value.trickLeader).toBe('north');
    // West's hand is empty.
    expect(r.value.hands.west.length).toBe(0);
  });

  it('lone caller whose partner is NOT to the dealer\'s left: lead is unchanged (dealer\'s left)', () => {
    // Dealer south, north calls alone round 2. North's partner is south
    // (the dealer), which is not to the dealer's left. Lead remains west.
    let state: GameState = freshRound1(21);
    if (state.phase !== 'bidding-round-1') throw new Error();
    const turnedSuit = state.turnedCard.suit;
    const r1Seats = ['west', 'north', 'east', 'south'] as const;
    for (const seat of r1Seats) {
      const r = applyAction(state, { type: 'pass', seat });
      if (!r.ok) throw new Error();
      state = r.value;
    }
    if (state.phase !== 'bidding-round-2') throw new Error();
    // West passes, north calls alone.
    let r = applyAction(state, { type: 'pass', seat: 'west' });
    if (!r.ok) throw new Error();
    state = r.value;
    if (state.phase !== 'bidding-round-2') throw new Error();
    const allSuits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const callSuit = allSuits.find((s) => s !== turnedSuit)!;
    r = applyAction(state, {
      type: 'callTrump',
      seat: 'north',
      suit: callSuit,
      alone: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.value.phase !== 'playing') throw new Error();
    // Lead is the dealer's left = west. North's partner south sits out.
    expect(r.value.sittingOut).toBe('south');
    expect(r.value.trickLeader).toBe('west');
  });
});
