/**
 * Test-only helpers. Not part of the public API. Imported by `*.test.ts`
 * files in this directory.
 *
 * Each test should `setupTestDb()` to get a fresh isolated database, then
 * `await db.delete()` (via the returned handle) in `afterEach`. Tests run
 * against `fake-indexeddb` so no real IndexedDB is needed.
 *
 * Owner: indexeddb-expert
 */

// `fake-indexeddb/auto` is registered globally by `tests/setup-indexeddb.ts`,
// which Vitest loads before any test file. No per-file import needed.

import { EuchreDb } from './db';
import { recordFromResult } from './hands';
import type { GameRecord, HandRecord } from './types';
import type { HandResult } from '@/lib/types';

let counter = 0;

/**
 * Build a fresh `EuchreDb` against an isolated database name. Each call
 * returns a distinct database so parallel tests don't collide.
 *
 * The name combines a wall-clock millisecond, a per-call counter, and a
 * random suffix so two workers calling at the same millisecond still
 * produce distinct names.
 */
export function setupTestDb(): EuchreDb {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return new EuchreDb(`euchre_test_${Date.now()}_${counter}_${rand}`);
}

/**
 * Build a `GameRecord` shell with sensible defaults. Caller can override
 * any field by passing a partial.
 */
export function makeGame(overrides: Partial<GameRecord> = {}): Omit<GameRecord, 'id'> {
  const base: Omit<GameRecord, 'id'> = {
    engineGameId: `eg_${Math.random().toString(36).slice(2)}`,
    gameKind: 'euchre',
    difficulty: 'medium',
    variants: {
      deckSize: 24,
      pointsToWin: 10,
      stickTheDealer: true,
      screwTheDealer: false,
      allowGoingAlone: true,
      joker: 'none',
      noTrump: false,
    },
    deckCount: 1,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    durationMs: 600_000,
    winner: 'ns',
    finalScore: { ns: 10, ew: 6 },
  };
  return { ...base, ...overrides };
}

/**
 * Build a `HandResult` (engine shape) with sensible defaults. Useful for
 * testing the `recordFromResult` translation.
 */
export function makeHandResult(overrides: Partial<HandResult> = {}): HandResult {
  const base: HandResult = {
    handId: 'eh_test' as HandResult['handId'],
    dealer: 'south',
    maker: 'ns',
    trump: 'spades',
    alone: false,
    tricksWon: { makers: 3, defenders: 2 },
    pointsAwarded: { ns: 1, ew: 0 },
    euchred: false,
    orderedUpInRound: 1,
  };
  return { ...base, ...overrides };
}

/**
 * Convenience: build a hand record bound to a game id, with optional
 * overrides on the underlying engine result.
 */
export function makeHand(
  gameId: number,
  index: number,
  overrides: Partial<HandResult> = {},
): Omit<HandRecord, 'id'> {
  return recordFromResult(gameId, index, makeHandResult(overrides));
}
