/**
 * Bot legality + factory tests.
 *
 * Verifies:
 *   - easyBot and mediumBot satisfy the Bot interface
 *   - Their `decide()` always returns a member of `legalActions(state, seat)`
 *     across a range of random seeded games (property-style)
 *   - hardBot stub rejects with an Error
 *
 * Owner: ai-strategy-expert
 */

import { describe, it, expect } from 'vitest';
import type { Action, GameState, Seat } from '@/lib/types';
import {
  advanceToNextHand,
  applyActionWithRng,
  isLegal,
  legalActions,
  createGame,
  seededRng,
} from '@/lib/euchre';
import { easyBot, hardBot, mediumBot } from './index';

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

describe('Bot factories', () => {
  it('easyBot exposes the Bot interface', () => {
    const b = easyBot();
    expect(b.name).toBe('Easy');
    expect(b.difficulty).toBe('easy');
    expect(typeof b.decide).toBe('function');
  });

  it('mediumBot exposes the Bot interface', () => {
    const b = mediumBot();
    expect(b.name).toBe('Medium');
    expect(b.difficulty).toBe('medium');
    expect(typeof b.decide).toBe('function');
  });

  it('hardBot stub rejects with an Error', async () => {
    const b = hardBot();
    expect(b.difficulty).toBe('hard');
    const initialState = createGame({ rng: seededRng(1), firstDealer: 'south' });
    await expect(b.decide(initialState, 'north', seededRng(0))).rejects.toThrow(
      /not implemented/,
    );
  });
});

describe('Bot decisions are always legal (property-style)', () => {
  it('Easy bot only returns legal actions across many seeded hands', async () => {
    const bot = easyBot();
    const seeds = [1, 2, 3, 17, 42, 99, 1234, 9999];
    for (const s of seeds) {
      const rng = seededRng(s);
      let state = createGame({ rng, firstDealer: 'south' });
      let safety = 0;
      while (state.phase !== 'game-complete' && safety < 5000) {
        safety++;
        if (state.phase === 'hand-complete') {
          state = advanceToNextHand(state, rng);
          continue;
        }
        const seat = activeSeat(state);
        if (seat === null) break;
        const action: Action = await bot.decide(state, seat, rng);
        // CORE assertion: action must be legal.
        const legal = legalActions(state, seat);
        const found = legal.some(
          (l) => JSON.stringify(l) === JSON.stringify(action),
        );
        if (!found) {
          throw new Error(
            `Illegal action by Easy: ${JSON.stringify(action)}; legal=${JSON.stringify(legal)}`,
          );
        }
        expect(isLegal(state, action)).toBe(true);
        const r = applyActionWithRng(state, action, rng);
        if (!r.ok) throw new Error(`unexpected reject: ${r.error.message}`);
        state = r.value;
      }
    }
  });

  it('Medium bot only returns legal actions across many seeded hands', async () => {
    const bot = mediumBot();
    const seeds = [1, 2, 3, 17, 42, 99, 1234, 9999];
    for (const s of seeds) {
      const rng = seededRng(s);
      let state = createGame({ rng, firstDealer: 'south' });
      let safety = 0;
      while (state.phase !== 'game-complete' && safety < 5000) {
        safety++;
        if (state.phase === 'hand-complete') {
          state = advanceToNextHand(state, rng);
          continue;
        }
        const seat = activeSeat(state);
        if (seat === null) break;
        const action: Action = await bot.decide(state, seat, rng);
        const legal = legalActions(state, seat);
        const found = legal.some(
          (l) => JSON.stringify(l) === JSON.stringify(action),
        );
        if (!found) {
          throw new Error(
            `Illegal action by Medium: ${JSON.stringify(action)}; legal=${JSON.stringify(legal)}`,
          );
        }
        const r = applyActionWithRng(state, action, rng);
        if (!r.ok) throw new Error(`unexpected reject: ${r.error.message}`);
        state = r.value;
      }
    }
  });
});

describe('Time budgets', () => {
  it('Easy bot median decide time < 50 ms', async () => {
    const bot = easyBot();
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const rng = seededRng(i + 1);
      const state = createGame({ rng, firstDealer: 'south' });
      const seat = activeSeat(state)!;
      const t0 = performance.now();
      await bot.decide(state, seat, rng);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const max = samples[samples.length - 1]!;
    // Generous bound — Easy is trivial. We allow one outlier so the worst-case
    // GC pause doesn't fail the suite, but the median is what matters.
    // eslint-disable-next-line no-console
    console.log(
      `[timing] Easy median=${median.toFixed(3)}ms max=${max.toFixed(3)}ms (n=100)`,
    );
    expect(median).toBeLessThan(50);
  });

  it('Medium bot median decide time < 200 ms', async () => {
    const bot = mediumBot();
    // Sample 100 decision points DURING active play, not just at game start —
    // mid-game is the worst case for Medium because inferredVoids walks the
    // full trick history.
    const samples: number[] = [];
    let collected = 0;
    let seedOffset = 0;
    while (collected < 100) {
      seedOffset++;
      const rng = seededRng(seedOffset + 5000);
      let state = createGame({ rng, firstDealer: 'south' });
      let safety = 0;
      while (state.phase !== 'game-complete' && safety < 200 && collected < 100) {
        safety++;
        if (state.phase === 'hand-complete') {
          const { advanceToNextHand } = await import('@/lib/euchre');
          state = advanceToNextHand(state, rng);
          continue;
        }
        const seat = activeSeat(state);
        if (seat === null) break;
        // Sample timing for THIS decision (regardless of phase), then apply.
        const t0 = performance.now();
        const action = await bot.decide(state, seat, rng);
        const dt = performance.now() - t0;
        // Only count playing-phase decisions for the timing budget.
        if (state.phase === 'playing') {
          samples.push(dt);
          collected++;
        }
        const r = applyActionWithRng(state, action, rng);
        if (!r.ok) break;
        state = r.value;
      }
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const max = samples[samples.length - 1]!;
    // eslint-disable-next-line no-console
    console.log(
      `[timing] Medium playing-phase median=${median.toFixed(3)}ms max=${max.toFixed(3)}ms (n=${samples.length})`,
    );
    expect(median).toBeLessThan(200);
  });
});
