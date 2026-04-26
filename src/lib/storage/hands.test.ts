/**
 * Round-trip tests for hand CRUD.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { saveGame } from './games';
import {
  boolToIndexed,
  getHandsForGame,
  recordFromResult,
  saveHand,
  saveHands,
  deleteHandsForGame,
  indexedToBool,
} from './hands';
import { makeGame, makeHand, makeHandResult, setupTestDb } from './test-utils';

describe('hands CRUD', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('boolToIndexed / indexedToBool are inverses', () => {
    expect(boolToIndexed(true)).toBe(1);
    expect(boolToIndexed(false)).toBe(0);
    expect(indexedToBool(1)).toBe(true);
    expect(indexedToBool(0)).toBe(false);
  });

  it('recordFromResult preserves engine fields and translates booleans', () => {
    const result = makeHandResult({ alone: true, euchred: true });
    const record = recordFromResult(7, 3, result);
    expect(record.gameId).toBe(7);
    expect(record.index).toBe(3);
    expect(record.alone).toBe(1);
    expect(record.euchred).toBe(1);
    expect(record.dealer).toBe(result.dealer);
    expect(record.maker).toBe(result.maker);
    expect(record.trump).toBe(result.trump);
    expect(record.tricksWon).toEqual(result.tricksWon);
    expect(record.pointsAwarded).toEqual(result.pointsAwarded);
    expect(record.orderedUpInRound).toBe(result.orderedUpInRound);
  });

  it('saveHand round-trips a single record', async () => {
    const gameId = await saveGame(makeGame(), database);
    const id = await saveHand(makeHand(gameId, 0, { alone: true }), database);
    const back = await database.hands.get(id);
    expect(back).toBeDefined();
    expect(back!.alone).toBe(1);
    expect(back!.gameId).toBe(gameId);
  });

  it('saveHands bulk-inserts and returns the ids', async () => {
    const gameId = await saveGame(makeGame(), database);
    const ids = await saveHands(
      [makeHand(gameId, 0), makeHand(gameId, 1), makeHand(gameId, 2)],
      database,
    );
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // all unique
  });

  it('getHandsForGame returns hands in (gameId+index) order', async () => {
    const gameId = await saveGame(makeGame(), database);
    // Insert out of order — the compound index returns them sorted.
    await saveHand(makeHand(gameId, 2), database);
    await saveHand(makeHand(gameId, 0), database);
    await saveHand(makeHand(gameId, 1), database);
    const hands = await getHandsForGame(gameId, database);
    expect(hands.map((h) => h.index)).toEqual([0, 1, 2]);
  });

  it('getHandsForGame is scoped to the requested game', async () => {
    const a = await saveGame(makeGame(), database);
    const b = await saveGame(makeGame(), database);
    await saveHand(makeHand(a, 0), database);
    await saveHand(makeHand(b, 0), database);
    await saveHand(makeHand(b, 1), database);
    expect(await getHandsForGame(a, database)).toHaveLength(1);
    expect(await getHandsForGame(b, database)).toHaveLength(2);
  });

  it('boolean fields persist as 0/1 in the raw row (not true/false)', async () => {
    const gameId = await saveGame(makeGame(), database);
    await saveHand(
      makeHand(gameId, 0, { alone: true, euchred: true }),
      database,
    );
    await saveHand(
      makeHand(gameId, 1, { alone: false, euchred: false }),
      database,
    );
    const all = await getHandsForGame(gameId, database);
    expect(all[0]!.alone).toBe(1);
    expect(all[0]!.euchred).toBe(1);
    expect(all[1]!.alone).toBe(0);
    expect(all[1]!.euchred).toBe(0);
    // Sanity: no row contains a true/false boolean for these fields.
    for (const h of all) {
      expect(typeof h.alone).toBe('number');
      expect(typeof h.euchred).toBe('number');
    }
  });

  it('boolean indexes are queryable by 1', async () => {
    const gameId = await saveGame(makeGame(), database);
    await saveHand(makeHand(gameId, 0, { euchred: true }), database);
    await saveHand(makeHand(gameId, 1, { euchred: false }), database);
    const euchred = await database.hands.where('euchred').equals(1).count();
    expect(euchred).toBe(1);
  });

  it('deleteHandsForGame returns the count and clears the rows', async () => {
    const gameId = await saveGame(makeGame(), database);
    await saveHand(makeHand(gameId, 0), database);
    await saveHand(makeHand(gameId, 1), database);
    const removed = await deleteHandsForGame(gameId, database);
    expect(removed).toBe(2);
    expect(await getHandsForGame(gameId, database)).toHaveLength(0);
  });
});
