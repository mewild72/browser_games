/**
 * Aggregate-query tests against seeded fixtures.
 *
 * Each test seeds a deterministic dataset and asserts the exact shape of
 * the aggregate result, so a regression in either filter logic or
 * aggregation arithmetic is caught at the unit level.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { saveGame } from './games';
import { saveHand } from './hands';
import {
  euchreRate,
  goingAloneStats,
  handsPlayed,
  recentGames,
  scoringDistribution,
  trumpDistribution,
  winRateByDifficulty,
} from './stats';
import { makeGame, makeHand, setupTestDb } from './test-utils';

describe('stats aggregates', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  /**
   * Seed a small, deterministic fixture:
   *   - 4 easy games:   3 wins for ns, 1 win for ew
   *   - 5 medium games: 2 wins for ns, 3 wins for ew
   *   - 3 hard games:   no winner (still in progress, endedAt=null)
   *   - 2 blackjack games (gameKind filter check)
   *   - hands distributed across the euchre games for trump / euchre /
   *     alone / scoring distributions
   */
  async function seed(): Promise<void> {
    // 4 easy euchre games — 3 ns wins, 1 ew win.
    const easy: number[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await saveGame(
        makeGame({
          difficulty: 'easy',
          startedAt: 1000 + i,
          winner: i < 3 ? 'ns' : 'ew',
        }),
        database,
      );
      easy.push(id);
    }
    // 5 medium euchre games — 2 ns, 3 ew.
    const medium: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await saveGame(
        makeGame({
          difficulty: 'medium',
          startedAt: 2000 + i,
          winner: i < 2 ? 'ns' : 'ew',
        }),
        database,
      );
      medium.push(id);
    }
    // 3 hard euchre games — in progress.
    for (let i = 0; i < 3; i++) {
      await saveGame(
        makeGame({
          difficulty: 'hard',
          startedAt: 3000 + i,
          endedAt: null,
          winner: null,
          finalScore: null,
          durationMs: null,
        }),
        database,
      );
    }
    // 2 blackjack games (filter check).
    for (let i = 0; i < 2; i++) {
      await saveGame(
        makeGame({
          gameKind: 'blackjack',
          difficulty: 'medium',
          startedAt: 4000 + i,
          deckCount: 6,
        }),
        database,
      );
    }

    // Hands across the easy games:
    //   game easy[0]: spades trump x2, alone+success, march for ns
    //   game easy[1]: clubs trump, ns euchred (defenders score 2)
    //   game easy[2]: diamonds, ew euchred (defenders score 2)
    //   game easy[3]: hearts, normal 1 pt to ns
    await saveHand(
      makeHand(easy[0]!, 0, {
        trump: 'spades',
        maker: 'ns',
        alone: true,
        euchred: false,
        tricksWon: { makers: 5, defenders: 0 },
        pointsAwarded: { ns: 4, ew: 0 },
      }),
      database,
    );
    await saveHand(
      makeHand(easy[0]!, 1, {
        trump: 'spades',
        maker: 'ns',
        alone: false,
        euchred: false,
        tricksWon: { makers: 5, defenders: 0 },
        pointsAwarded: { ns: 2, ew: 0 },
      }),
      database,
    );
    await saveHand(
      makeHand(easy[1]!, 0, {
        trump: 'clubs',
        maker: 'ns',
        alone: false,
        euchred: true,
        tricksWon: { makers: 1, defenders: 4 },
        pointsAwarded: { ns: 0, ew: 2 },
      }),
      database,
    );
    await saveHand(
      makeHand(easy[2]!, 0, {
        trump: 'diamonds',
        maker: 'ew',
        alone: false,
        euchred: true,
        tricksWon: { makers: 1, defenders: 4 },
        pointsAwarded: { ns: 2, ew: 0 },
      }),
      database,
    );
    await saveHand(
      makeHand(easy[3]!, 0, {
        trump: 'hearts',
        maker: 'ns',
        alone: false,
        euchred: false,
        tricksWon: { makers: 3, defenders: 2 },
        pointsAwarded: { ns: 1, ew: 0 },
      }),
      database,
    );
    // One alone-fail hand on a medium game so the success-rate split is
    // not a clean 100%.
    await saveHand(
      makeHand(medium[0]!, 0, {
        trump: 'spades',
        maker: 'ns',
        alone: true,
        euchred: true,
        tricksWon: { makers: 1, defenders: 4 },
        pointsAwarded: { ns: 0, ew: 2 },
      }),
      database,
    );
  }

  it('winRateByDifficulty reports the correct fraction', async () => {
    await seed();
    expect(await winRateByDifficulty('easy', 'euchre', database)).toBeCloseTo(
      3 / 4,
    );
    expect(
      await winRateByDifficulty('medium', 'euchre', database),
    ).toBeCloseTo(2 / 5);
  });

  it('winRateByDifficulty excludes in-progress games', async () => {
    await seed();
    // Hard tier has only in-progress games (endedAt=null), so the
    // computation should treat the population as empty → 0.
    expect(await winRateByDifficulty('hard', 'euchre', database)).toBe(0);
  });

  it('winRateByDifficulty respects the gameKind filter', async () => {
    await seed();
    // Blackjack medium games have winner=ns by default, so 100% (2/2).
    expect(
      await winRateByDifficulty('medium', 'blackjack', database),
    ).toBeCloseTo(1);
  });

  it('euchreRate splits maker vs defender euchres correctly', async () => {
    await seed();
    // 6 hands in euchre kind. 1 hand was ns-maker euchred (easy[1]).
    // 1 hand was ew-maker euchred (easy[2]). 1 alone-fail (medium[0]) is
    // ns-maker euchred. So as-makers (ns euchred) = 2/6, as-defenders =
    // 1/6 (the ew-maker euchre).
    const r = await euchreRate('euchre', database);
    expect(r.asMakers).toBeCloseTo(2 / 6);
    expect(r.asDefenders).toBeCloseTo(1 / 6);
  });

  it('trumpDistribution counts every suit', async () => {
    await seed();
    const t = await trumpDistribution('euchre', database);
    expect(t).toEqual({ clubs: 1, diamonds: 1, hearts: 1, spades: 3 });
  });

  it('goingAloneStats reports call rate and success rate', async () => {
    await seed();
    // 6 euchre hands; 2 alone calls (one success, one fail).
    const s = await goingAloneStats('euchre', database);
    expect(s.callRate).toBeCloseTo(2 / 6);
    expect(s.successRate).toBeCloseTo(1 / 2);
  });

  it('goingAloneStats handles the no-data case', async () => {
    const s = await goingAloneStats('euchre', database);
    expect(s).toEqual({ callRate: 0, successRate: 0 });
  });

  it('handsPlayed counts only the requested kind', async () => {
    await seed();
    expect(await handsPlayed('euchre', database)).toBe(6);
    expect(await handsPlayed('blackjack', database)).toBe(0);
  });

  it('recentGames returns N newest, kind-filtered', async () => {
    await seed();
    const recent = await recentGames(3, 'euchre', database);
    expect(recent).toHaveLength(3);
    // Newest first by startedAt.
    expect(recent[0]!.startedAt).toBeGreaterThan(recent[1]!.startedAt);
    expect(recent[1]!.startedAt).toBeGreaterThan(recent[2]!.startedAt);
    // None should be from the blackjack set (4000+).
    for (const g of recent) {
      expect(g.gameKind).toBe('euchre');
    }
  });

  it('recentGames clamps a 0 / negative limit to empty', async () => {
    await seed();
    expect(await recentGames(0, 'euchre', database)).toEqual([]);
    expect(await recentGames(-5, 'euchre', database)).toEqual([]);
  });

  it('scoringDistribution buckets per-hand outcomes', async () => {
    await seed();
    // Hands & maker points (ns or ew, depending on `maker`):
    //   easy[0]/0: alone march → 4 pts to ns (maker)   → '4'
    //   easy[0]/1: march       → 2 pts to ns           → '2'
    //   easy[1]/0: euchred (ns maker) → 0              → '0'
    //   easy[2]/0: euchred (ew maker) → 0              → '0'
    //   easy[3]/0: 1 pt to ns                          → '1'
    //   medium[0]/0: alone fail (ns maker) → 0         → '0'
    expect(await scoringDistribution('euchre', database)).toEqual({
      '0': 3,
      '1': 1,
      '2': 1,
      '4': 1,
    });
  });
});
