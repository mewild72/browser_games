/**
 * Schema tests for the Dexie database.
 *
 * Verifies that v1 declares the right stores and indexes. If a future
 * version bump is added, mirror this test against the new version so
 * regressions are caught at build time.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { setupTestDb } from './test-utils';

describe('EuchreDb schema v1', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('declares the four expected stores', async () => {
    await database.open();
    const names = database.tables.map((t) => t.name).sort();
    expect(names).toEqual(['games', 'hands', 'replays', 'settings']);
  });

  it('declares the expected indexes on games', async () => {
    await database.open();
    const games = database.tables.find((t) => t.name === 'games');
    expect(games).toBeDefined();
    const indexNames = games!.schema.indexes.map((i) => i.name).sort();
    // Auto-incrementing PK is not in `indexes`; the secondary indexes are.
    expect(indexNames).toEqual(
      [
        'startedAt',
        'endedAt',
        'gameKind',
        'difficulty',
        'winner',
        'deckCount',
      ].sort(),
    );
  });

  it('declares the expected indexes on hands (including the compound)', async () => {
    await database.open();
    const hands = database.tables.find((t) => t.name === 'hands');
    expect(hands).toBeDefined();
    const indexNames = hands!.schema.indexes.map((i) => i.name).sort();
    expect(indexNames).toEqual(
      ['gameId', '[gameId+index]', 'maker', 'euchred', 'trump', 'alone'].sort(),
    );
  });

  it('declares settings keyed by `key`', async () => {
    await database.open();
    const settings = database.tables.find((t) => t.name === 'settings');
    expect(settings).toBeDefined();
    expect(settings!.schema.primKey.name).toBe('key');
    // & in the schema string means unique non-auto.
    expect(settings!.schema.primKey.auto).toBe(false);
  });

  it('reports verno === 1', async () => {
    await database.open();
    expect(database.verno).toBe(1);
  });
});
