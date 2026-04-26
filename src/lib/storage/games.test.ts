/**
 * Round-trip tests for game CRUD.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { saveGame, getGame, listGames, deleteGame, updateGame } from './games';
import { saveHand } from './hands';
import { makeGame, makeHand, setupTestDb } from './test-utils';

describe('games CRUD', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('saveGame returns an auto id and getGame round-trips fields', async () => {
    const id = await saveGame(makeGame({ difficulty: 'easy' }), database);
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const back = await getGame(id, database);
    expect(back).toBeDefined();
    expect(back!.difficulty).toBe('easy');
    expect(back!.variants.pointsToWin).toBe(10);
    expect(back!.finalScore).toEqual({ ns: 10, ew: 6 });
  });

  it('updateGame patches fields and rejects unknown ids', async () => {
    const id = await saveGame(
      makeGame({ endedAt: null, finalScore: null, winner: null, durationMs: null }),
      database,
    );
    await updateGame(
      id,
      { endedAt: 123, durationMs: 5, winner: 'ew', finalScore: { ns: 4, ew: 10 } },
      database,
    );
    const back = await getGame(id, database);
    expect(back!.winner).toBe('ew');
    expect(back!.finalScore).toEqual({ ns: 4, ew: 10 });
    await expect(updateGame(99999, { winner: 'ns' }, database)).rejects.toThrow(
      /no game with id=99999/,
    );
  });

  it('listGames returns newest-first and filters by gameKind / difficulty', async () => {
    await saveGame(
      makeGame({ startedAt: 1000, difficulty: 'easy', gameKind: 'euchre' }),
      database,
    );
    await saveGame(
      makeGame({ startedAt: 2000, difficulty: 'hard', gameKind: 'euchre' }),
      database,
    );
    await saveGame(
      makeGame({ startedAt: 3000, difficulty: 'medium', gameKind: 'blackjack' }),
      database,
    );
    const all = await listGames({}, database);
    expect(all.map((g) => g.startedAt)).toEqual([3000, 2000, 1000]);
    const onlyEuchre = await listGames({ gameKind: 'euchre' }, database);
    expect(onlyEuchre.map((g) => g.startedAt)).toEqual([2000, 1000]);
    const onlyHard = await listGames(
      { gameKind: 'euchre', difficulty: 'hard' },
      database,
    );
    expect(onlyHard).toHaveLength(1);
    expect(onlyHard[0]!.difficulty).toBe('hard');
    const limited = await listGames({ limit: 2 }, database);
    expect(limited).toHaveLength(2);
  });

  it('deleteGame removes the game and its hands in one transaction', async () => {
    const id = await saveGame(makeGame(), database);
    await saveHand(makeHand(id, 0), database);
    await saveHand(makeHand(id, 1), database);
    await saveHand(makeHand(id, 2), database);
    const result = await deleteGame(id, database);
    expect(result.handsDeleted).toBe(3);
    expect(await getGame(id, database)).toBeUndefined();
    const handsLeft = await database.hands.where('gameId').equals(id).count();
    expect(handsLeft).toBe(0);
  });
});
