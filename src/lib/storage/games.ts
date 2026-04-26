/**
 * CRUD operations on `games`.
 *
 * The public API never returns Dexie collections — every function resolves
 * to plain typed objects (or arrays) so consumers don't take a dependency
 * on Dexie types.
 *
 * Owner: indexeddb-expert
 */

import { db, EuchreDb } from './db';
import type { GameRecord } from './types';

/**
 * Insert a new game row. Returns the auto-generated id.
 *
 * The caller usually inserts an in-progress row at game-start with
 * `endedAt: null`, then `update`s it at game-end with the final score and
 * winner. Splitting the lifecycle this way means a crashed/abandoned game
 * still leaves a record we can clean up.
 */
export async function saveGame(
  record: Omit<GameRecord, 'id'>,
  database: EuchreDb = db,
): Promise<number> {
  // Dexie returns the inserted key as the table's IndexableType. Our table
  // is keyed by `number`, so the cast is safe — but we narrow explicitly so
  // the public type stays plain.
  const id = await database.games.add(record as GameRecord);
  // Dexie's add() typing returns IndexableType; narrow because our PK is number.
  return id;
}

/**
 * Update an existing game row in place. Useful for game-end (set
 * `endedAt`, `winner`, `finalScore`, `durationMs`).
 *
 * Throws if the id does not exist (Dexie returns 0 on miss; we surface
 * that as an Error so misuse is loud).
 */
export async function updateGame(
  id: number,
  patch: Partial<Omit<GameRecord, 'id'>>,
  database: EuchreDb = db,
): Promise<void> {
  const updated = await database.games.update(id, patch);
  if (updated === 0) {
    throw new Error(`updateGame: no game with id=${id}`);
  }
}

/**
 * Fetch one game by id. Resolves to `undefined` if not found — the caller
 * decides whether that's a 404 or a normal "not yet" case.
 */
export async function getGame(
  id: number,
  database: EuchreDb = db,
): Promise<GameRecord | undefined> {
  return database.games.get(id);
}

/**
 * List games, newest-first by `startedAt`. Optional filters narrow the
 * result before sort.
 *
 * `limit === undefined` returns everything. The dataset is tiny — even a
 * heavy player produces a few hundred games — so an unindexed sort over the
 * full table is fine.
 */
export async function listGames(
  opts: {
    readonly gameKind?: GameRecord['gameKind'];
    readonly difficulty?: GameRecord['difficulty'];
    readonly limit?: number;
  } = {},
  database: EuchreDb = db,
): Promise<readonly GameRecord[]> {
  let coll = database.games.orderBy('startedAt').reverse();
  if (opts.gameKind !== undefined) {
    const kind = opts.gameKind;
    coll = coll.filter((g) => g.gameKind === kind);
  }
  if (opts.difficulty !== undefined) {
    const diff = opts.difficulty;
    coll = coll.filter((g) => g.difficulty === diff);
  }
  const rows = opts.limit === undefined ? await coll.toArray() : await coll.limit(opts.limit).toArray();
  return rows;
}

/**
 * Delete a game and all of its hands in a single transaction. The replay
 * row (if any) is also removed.
 *
 * Returns the number of hand rows that were deleted alongside the game.
 */
export async function deleteGame(
  id: number,
  database: EuchreDb = db,
): Promise<{ readonly handsDeleted: number }> {
  return database.transaction(
    'rw',
    database.games,
    database.hands,
    database.replays,
    async () => {
      const handsDeleted = await database.hands
        .where('gameId')
        .equals(id)
        .delete();
      await database.replays.where('gameId').equals(id).delete();
      await database.games.delete(id);
      return { handsDeleted };
    },
  );
}

export { db };
