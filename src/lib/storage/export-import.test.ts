/**
 * Export/import round-trip tests.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { saveGame, listGames } from './games';
import { getHandsForGame, saveHand } from './hands';
import { exportAll, ImportError, importAll } from './export-import';
import { makeGame, makeHand, setupTestDb } from './test-utils';

describe('exportAll / importAll', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('exports an envelope with schemaVersion, exportedAt, and arrays', async () => {
    await database.open();
    const file = await exportAll(database);
    expect(file.schemaVersion).toBe(1);
    expect(typeof file.exportedAt).toBe('string');
    expect(Array.isArray(file.games)).toBe(true);
    expect(Array.isArray(file.hands)).toBe(true);
    expect(Array.isArray(file.settings)).toBe(true);
  });

  it('round-trips losslessly (deep-equal before vs after)', async () => {
    const gA = await saveGame(makeGame({ difficulty: 'easy' }), database);
    const gB = await saveGame(makeGame({ difficulty: 'hard' }), database);
    await saveHand(makeHand(gA, 0, { trump: 'spades' }), database);
    await saveHand(makeHand(gA, 1, { trump: 'hearts' }), database);
    await saveHand(makeHand(gB, 0, { trump: 'clubs' }), database);
    await database.settings.put({ key: 'displayName', value: 'Mary' });

    const before = await exportAll(database);
    // Serialize → deserialize, simulating a round-trip through a `.json` file.
    const wire = JSON.parse(JSON.stringify(before));

    // Tear down the database and bring up a fresh one — the import must
    // populate it from the wire bytes alone.
    database.close();
    await database.delete();
    database = setupTestDb();

    await importAll(wire, database);

    const after = await exportAll(database);
    // The exportedAt timestamps differ across the two exports; compare
    // everything else directly.
    expect(after.schemaVersion).toBe(before.schemaVersion);
    expect(after.games).toEqual(before.games);
    expect(after.hands).toEqual(before.hands);
    expect(after.settings).toEqual(before.settings);
  });

  it('preserves auto-incremented ids so FKs still resolve', async () => {
    const gA = await saveGame(makeGame(), database);
    await saveHand(makeHand(gA, 0), database);
    await saveHand(makeHand(gA, 1), database);
    const wire = JSON.parse(JSON.stringify(await exportAll(database)));

    database.close();
    await database.delete();
    database = setupTestDb();

    await importAll(wire, database);

    const games = await listGames({}, database);
    expect(games).toHaveLength(1);
    const onlyGame = games[0]!;
    expect(onlyGame.id).toBe(gA);
    const hands = await getHandsForGame(gA, database);
    expect(hands).toHaveLength(2);
    expect(hands.map((h) => h.gameId)).toEqual([gA, gA]);
  });

  it('refuses files from a newer schemaVersion', async () => {
    const file = {
      schemaVersion: 99,
      exportedAt: new Date().toISOString(),
      games: [],
      hands: [],
      settings: [],
    };
    await expect(importAll(file, database)).rejects.toBeInstanceOf(ImportError);
    await expect(importAll(file, database)).rejects.toThrow(
      /newer than the app/,
    );
  });

  it('refuses malformed envelopes', async () => {
    // Missing required fields.
    await expect(
      importAll({ schemaVersion: 1 } as unknown as Parameters<typeof importAll>[0], database),
    ).rejects.toBeInstanceOf(ImportError);
    await expect(
      importAll(null as unknown as Parameters<typeof importAll>[0], database),
    ).rejects.toBeInstanceOf(ImportError);
  });

  it('is destructive — pre-existing rows are wiped before insert', async () => {
    const stale = await saveGame(makeGame({ difficulty: 'easy' }), database);
    expect(await listGames({}, database)).toHaveLength(1);

    const fresh = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      games: [],
      hands: [],
      settings: [],
    };
    await importAll(fresh, database);
    expect(await listGames({}, database)).toHaveLength(0);
    // The pre-existing id should no longer resolve either.
    expect(await database.games.get(stale)).toBeUndefined();
  });
});
