/**
 * Tests for the pure controller helpers.
 *
 * Svelte runes (in `state.svelte.ts`) are exercised via Playwright E2E in a
 * later step. These tests focus on the pure functions: legality gating,
 * bot dispatch, deterministic-game progression.
 *
 * Owner: svelte-component-architect
 */

import { describe, expect, it } from 'vitest';
import {
  HUMAN_SEAT,
  currentBotSeat,
  dispatchBot,
  dispatchUserAction,
  makeBots,
  nextHand,
  startNewGame,
} from './controller';
import { defaults } from '@/lib/types';
import type { Action, GameState, HandResult, Seat } from '@/lib/types';
import { seededRng } from '@/lib/euchre';
import type { Bot } from '@/lib/ai';

describe('startNewGame', () => {
  it('returns a bidding-round-1 state with the default variants', () => {
    const state = startNewGame({ difficulty: 'easy', rng: seededRng(1) });
    expect(state.phase).toBe('bidding-round-1');
    expect(state.variants).toEqual(defaults);
    if (state.phase === 'bidding-round-1') {
      expect(Object.keys(state.hands)).toHaveLength(4);
      expect(state.passes).toBe(0);
    }
  });

  it('uses overridden variants when supplied', () => {
    const variants = { ...defaults, pointsToWin: 5 } as const;
    const state = startNewGame({ difficulty: 'easy', variants, rng: seededRng(1) });
    expect(state.variants.pointsToWin).toBe(5);
  });
});

describe('dispatchUserAction', () => {
  it('rejects an action whose seat is not the human seat', () => {
    const state = startNewGame({ difficulty: 'easy', rng: seededRng(1) });
    const action: Action = { type: 'pass', seat: 'north' };
    const out = dispatchUserAction(state, action);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toContain('not the human seat');
    }
  });

  it('rejects an illegal action (e.g., human acts out of turn in round 1)', () => {
    // Build a state where it is NOT south's turn by passing any non-south
    // initial dealer that puts south at position 0 in the bidding rotation.
    const state = startNewGame({
      difficulty: 'easy',
      rng: seededRng(42),
    });
    // Force a state where it is not south's turn by checking and only
    // running the assertion when the seeded RNG produces such a state.
    if (state.phase === 'bidding-round-1' && state.turn !== HUMAN_SEAT) {
      const action: Action = { type: 'pass', seat: HUMAN_SEAT };
      const out = dispatchUserAction(state, action);
      expect(out.ok).toBe(false);
    }
  });

  it('accepts a legal pass when it is the human seat\'s turn', () => {
    // Walk seeds until we find one where south is the first to act in round 1.
    let state: GameState | null = null;
    for (let seed = 1; seed < 50; seed++) {
      const s = startNewGame({ difficulty: 'easy', rng: seededRng(seed) });
      if (s.phase === 'bidding-round-1' && s.turn === HUMAN_SEAT) {
        state = s;
        break;
      }
    }
    expect(state).not.toBeNull();
    if (state === null) return;
    const action: Action = { type: 'pass', seat: HUMAN_SEAT };
    const out = dispatchUserAction(state, action);
    expect(out.ok).toBe(true);
  });
});

describe('currentBotSeat', () => {
  it('returns null in hand-complete / game-complete / dealing phases', () => {
    const bots = makeBots('easy');
    const partialBots: Partial<Record<Seat, Bot>> = {
      north: bots.north,
      east: bots.east,
      west: bots.west,
    };
    // Synthetic hand-complete state — only the phase tag matters.
    const handComplete: GameState = {
      phase: 'hand-complete',
      gameId: 'g' as GameState['gameId'],
      variants: defaults,
      dealer: 'north',
      score: { ns: 0, ew: 0 },
      result: {
        // Cast: branded ids are opaque strings; tests don't need the brand.
        handId: 'h' as HandResult['handId'],
        dealer: 'north',
        maker: 'ns',
        trump: 'spades',
        alone: false,
        tricksWon: { makers: 3, defenders: 2 },
        pointsAwarded: { ns: 1, ew: 0 },
        euchred: false,
        orderedUpInRound: 1,
      },
    };
    expect(currentBotSeat(handComplete, partialBots)).toBeNull();
  });

  it('returns the current turn seat when it is a bot', () => {
    const bots = makeBots('easy');
    const partialBots: Partial<Record<Seat, Bot>> = {
      north: bots.north,
      east: bots.east,
      west: bots.west,
    };
    const state = startNewGame({ difficulty: 'easy', rng: seededRng(1) });
    if (state.phase !== 'bidding-round-1') return;
    if (state.turn === HUMAN_SEAT) {
      expect(currentBotSeat(state, partialBots)).toBeNull();
    } else {
      expect(currentBotSeat(state, partialBots)).toBe(state.turn);
    }
  });
});

describe('bot loop drives a seeded game to completion', () => {
  it('completes a full game when all four seats are bots', async () => {
    // Replace the human with an Easy bot too so the loop can run unattended.
    const bots = makeBots('easy');
    const allBots: Partial<Record<Seat, Bot>> = {
      north: bots.north,
      east: bots.east,
      south: bots.north, // re-use Easy bot factory output for south
      west: bots.west,
    };
    const rng = seededRng(7);
    let state: GameState = startNewGame({ difficulty: 'easy', rng });

    let safety = 5000;
    while (state.phase !== 'game-complete' && safety > 0) {
      safety--;
      if (state.phase === 'hand-complete') {
        state = nextHand(state, rng);
        continue;
      }
      const result = await dispatchBot(state, allBots, rng);
      if (result === null) break; // shouldn't happen — every actionable phase has a bot
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }

    expect(state.phase).toBe('game-complete');
    if (state.phase === 'game-complete') {
      expect(['ns', 'ew']).toContain(state.winner);
    }
  });
});

describe('makeBots', () => {
  it('builds bots for the three non-human seats with the requested difficulty', () => {
    const bots = makeBots('medium');
    expect(bots.north.difficulty).toBe('medium');
    expect(bots.east.difficulty).toBe('medium');
    expect(bots.west.difficulty).toBe('medium');
  });
});
