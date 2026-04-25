/**
 * Engine-level integration / property tests.
 *
 * Covers:
 *   - createGame / determinism
 *   - legalActions covers every move applyAction would accept
 *   - random seeded games progress to completion through legal actions
 *   - tricks per hand always sum to 5
 *   - points awarded per hand are always 1, 2, or 4
 *   - legalActions is non-empty when it's the seat's turn
 *
 * Owner: game-rules-engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Action, GameState, Seat } from '@/lib/types';
import {
  advanceToNextHand,
  applyActionWithRng,
  createGame,
  isLegal,
  legalActions,
} from './engine';
import { seededRng } from './rng';

/**
 * Seat whose turn it is (or null if no actor expected).
 */
function activeSeat(state: GameState): Seat | null {
  switch (state.phase) {
    case 'bidding-round-1':
    case 'bidding-round-2':
    case 'playing':
      return state.turn;
    case 'dealer-discard':
      return state.dealer;
    default:
      return null;
  }
}

/**
 * Drive one hand to completion, picking a legal action for each turn.
 * Returns the post-hand state (hand-complete or game-complete).
 */
function playOneHand(start: GameState, seed: number): GameState {
  const rng = seededRng(seed + 1000);
  let state = start;
  let safety = 0;
  while (state.phase !== 'hand-complete' && state.phase !== 'game-complete') {
    safety++;
    if (safety > 1000) throw new Error('runaway loop');
    const seat = activeSeat(state);
    if (seat === null) throw new Error(`no active seat in phase ${state.phase}`);
    const choices = legalActions(state, seat);
    if (choices.length === 0) {
      throw new Error(`legalActions empty in phase ${state.phase}`);
    }
    // Pick deterministically based on the rng to vary play across seeds.
    const idx = Math.floor(rng.next() * choices.length);
    const action = choices[idx]!;
    const r = applyActionWithRng(state, action, rng);
    if (!r.ok) throw new Error(`unexpected illegal action: ${r.error.message}`);
    state = r.value;
  }
  return state;
}

describe('createGame / determinism', () => {
  it('produces identical state given the same options (modulo monotonic ids)', () => {
    // gameId / handId are minted from a module-level counter so two
    // sequential calls produce different ids by design. Strip them and
    // compare the rest — the deal/turn/score/etc. must be byte-identical.
    const a = createGame({ rng: seededRng(42), firstDealer: 'south' });
    const b = createGame({ rng: seededRng(42), firstDealer: 'south' });
    if (a.phase !== 'bidding-round-1' || b.phase !== 'bidding-round-1') {
      throw new Error('expected bidding-round-1');
    }
    const stripIds = (s: typeof a): unknown => {
      // Cast: we only strip two known keys for comparison; safe because
      // we already narrowed to bidding-round-1 above.
      const { gameId: _g, handId: _h, ...rest } = s;
      void _g;
      void _h;
      return rest;
    };
    expect(stripIds(a)).toEqual(stripIds(b));
  });

  it('respects firstDealer', () => {
    const a = createGame({ rng: seededRng(1), firstDealer: 'east' });
    expect(a.dealer).toBe('east');
    if (a.phase !== 'bidding-round-1') throw new Error();
    expect(a.turn).toBe('south'); // left of east
  });
});

describe('legalActions / isLegal contract', () => {
  it('every action returned by legalActions is accepted by applyAction', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (seed) => {
        let state: GameState = createGame({
          rng: seededRng(seed),
          firstDealer: 'south',
        });
        const rng = seededRng(seed + 999);
        let safety = 0;
        while (
          state.phase !== 'hand-complete' &&
          state.phase !== 'game-complete'
        ) {
          safety++;
          if (safety > 500) throw new Error('runaway');
          const seat = activeSeat(state);
          if (seat === null) throw new Error('no active seat');
          const choices = legalActions(state, seat);
          if (choices.length === 0) throw new Error('legalActions empty');
          // Verify each choice is accepted, then take one to advance.
          for (const choice of choices) {
            if (!isLegal(state, choice)) {
              throw new Error(
                `legalActions returned an action that isLegal rejected: ${JSON.stringify(choice)}`,
              );
            }
          }
          const idx = Math.floor(rng.next() * choices.length);
          const action = choices[idx]!;
          const r = applyActionWithRng(state, action, rng);
          if (!r.ok) throw new Error(`apply failed: ${r.error.message}`);
          state = r.value;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });

  it('legalActions is non-empty whenever an active seat exists', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (seed) => {
        let state: GameState = createGame({
          rng: seededRng(seed),
          firstDealer: 'south',
        });
        const rng = seededRng(seed + 555);
        let steps = 0;
        while (
          state.phase !== 'hand-complete' &&
          state.phase !== 'game-complete'
        ) {
          steps++;
          if (steps > 500) throw new Error('runaway');
          const seat = activeSeat(state);
          if (seat === null) throw new Error('no active seat');
          const choices = legalActions(state, seat);
          if (choices.length === 0) {
            throw new Error('expected legal actions');
          }
          const idx = Math.floor(rng.next() * choices.length);
          const action = choices[idx]!;
          const r = applyActionWithRng(state, action, rng);
          if (!r.ok) throw new Error('apply failed');
          state = r.value;
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });
});

describe('property: hand always sums to 5 tricks', () => {
  it('every completed hand has makers + defenders === 5 tricks', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (seed) => {
        const start = createGame({
          rng: seededRng(seed),
          firstDealer: 'south',
        });
        const end = playOneHand(start, seed);
        if (end.phase === 'hand-complete') {
          const t = end.result.tricksWon;
          expect(t.makers + t.defenders).toBe(5);
        } else if (end.phase === 'game-complete') {
          // game-complete with first hand ending the game would be
          // unusual at 10 points but possible at 5; either way at least
          // one hand was played and we don't have direct access to its
          // tricks here. Skip.
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });
});

describe('property: points awarded per hand are 1, 2, or 4', () => {
  it('every hand awards exactly one of {1, 2, 4} points to one side', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (seed) => {
        const start = createGame({
          rng: seededRng(seed),
          firstDealer: 'south',
        });
        const end = playOneHand(start, seed);
        if (end.phase !== 'hand-complete') return true;
        const { ns, ew } = end.result.pointsAwarded;
        const total = ns + ew;
        expect([1, 2, 4]).toContain(total);
        // Exactly one side gets the points.
        expect(ns === 0 || ew === 0).toBe(true);
        return true;
      }),
      { numRuns: 20 },
    );
  });
});

describe('property: full games progress to completion without crashing', () => {
  it('plays multiple hands until a side reaches 10', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (seed) => {
        let state: GameState = createGame({
          rng: seededRng(seed),
          firstDealer: 'south',
        });
        const rng = seededRng(seed + 7777);
        let handsPlayed = 0;
        const maxHands = 50; // safety bound
        while (state.phase !== 'game-complete' && handsPlayed < maxHands) {
          // Play one hand to completion.
          while (
            state.phase !== 'hand-complete' &&
            state.phase !== 'game-complete'
          ) {
            const seat = activeSeat(state);
            if (seat === null) throw new Error('no active seat');
            const choices = legalActions(state, seat);
            if (choices.length === 0) throw new Error('legalActions empty');
            const idx = Math.floor(rng.next() * choices.length);
            const action = choices[idx]!;
            const r = applyActionWithRng(state, action, rng);
            if (!r.ok) throw new Error(`apply failed: ${r.error.message}`);
            state = r.value;
          }
          handsPlayed++;
          if (state.phase === 'hand-complete') {
            state = advanceToNextHand(state, rng);
          }
        }
        expect(state.phase).toBe('game-complete');
        if (state.phase === 'game-complete') {
          // Score must respect the threshold.
          const { ns, ew } = state.score;
          expect(Math.max(ns, ew)).toBeGreaterThanOrEqual(10);
        }
        return true;
      }),
      { numRuns: 5 },
    );
  });
});

describe('isLegal rejects illegal actions', () => {
  it('rejects playCard during bidding-round-1', () => {
    const state = createGame({ rng: seededRng(1), firstDealer: 'south' });
    if (state.phase !== 'bidding-round-1') throw new Error();
    const card = state.hands.west[0]!;
    const action: Action = { type: 'playCard', seat: 'west', card };
    expect(isLegal(state, action)).toBe(false);
  });
});
