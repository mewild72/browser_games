/**
 * CRUD operations on `hands`.
 *
 * Boolean fields persisted to indexed columns (`alone`, `euchred`) are
 * stored as `0 | 1`. The engine produces booleans; helper functions in
 * this module are responsible for translating to the `IndexedBool`
 * encoding before insert.
 *
 * Owner: indexeddb-expert
 */

import { db, EuchreDb } from './db';
import type { HandRecord, IndexedBool } from './types';
import type { HandResult } from '@/lib/types';

/**
 * Translate a primitive boolean into the indexed-friendly `0 | 1` form.
 */
export function boolToIndexed(value: boolean): IndexedBool {
  return value ? 1 : 0;
}

/**
 * Translate the indexed-friendly form back to boolean. Useful when the UI
 * wants to render a hand summary.
 */
export function indexedToBool(value: IndexedBool): boolean {
  return value === 1;
}

/**
 * Build a `HandRecord` shell from an engine `HandResult` and an index.
 * Caller supplies the FK `gameId`; the engine layer doesn't know it.
 */
export function recordFromResult(
  gameId: number,
  index: number,
  result: HandResult,
): Omit<HandRecord, 'id'> {
  return {
    gameId,
    engineHandId: result.handId,
    index,
    dealer: result.dealer,
    maker: result.maker,
    trump: result.trump,
    alone: boolToIndexed(result.alone),
    tricksWon: result.tricksWon,
    pointsAwarded: result.pointsAwarded,
    euchred: boolToIndexed(result.euchred),
    orderedUpInRound: result.orderedUpInRound,
  };
}

/**
 * Insert one hand record. The caller is responsible for pre-translating
 * booleans (use `recordFromResult` if starting from a `HandResult`).
 */
export async function saveHand(
  record: Omit<HandRecord, 'id'>,
  database: EuchreDb = db,
): Promise<number> {
  const id = await database.hands.add(record as HandRecord);
  return id;
}

/**
 * Bulk-insert hands. Used by `importAll`.
 */
export async function saveHands(
  records: readonly Omit<HandRecord, 'id'>[],
  database: EuchreDb = db,
): Promise<readonly number[]> {
  const ids = await database.hands.bulkAdd(records as HandRecord[], {
    allKeys: true,
  });
  return ids;
}

/**
 * Fetch all hands for a game in play order.
 *
 * The compound index `[gameId+index]` lets Dexie return the rows already
 * sorted, no in-memory sort needed.
 */
export async function getHandsForGame(
  gameId: number,
  database: EuchreDb = db,
): Promise<readonly HandRecord[]> {
  // `between` with [gameId, 0]..[gameId, Infinity] uses the compound index
  // to stream rows in (gameId, index) order. `Infinity` works for IDB
  // numeric ranges per the spec.
  return database.hands
    .where('[gameId+index]')
    .between([gameId, -Infinity], [gameId, Infinity])
    .toArray();
}

/**
 * Delete all hands attached to a game. Used both directly (rare) and by
 * `deleteGame` inside its transaction.
 */
export async function deleteHandsForGame(
  gameId: number,
  database: EuchreDb = db,
): Promise<number> {
  return database.hands.where('gameId').equals(gameId).delete();
}
