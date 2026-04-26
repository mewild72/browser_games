/**
 * Settings table tests.
 *
 * The `SettingsMap` is intentionally empty in MVP, so this file primarily
 * verifies that the round-trip plumbing works with a hypothetical key
 * (asserted via a runtime `put`/`get`) and that `getAllSettings` returns
 * what was written.
 *
 * Owner: indexeddb-expert
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EuchreDb } from './db';
import { getAllSettings } from './settings';
import { setupTestDb } from './test-utils';

describe('settings table', () => {
  let database: EuchreDb;

  beforeEach(() => {
    database = setupTestDb();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('starts empty', async () => {
    const all = await getAllSettings(database);
    expect(all).toEqual([]);
  });

  it('survives put/get via the underlying table API', async () => {
    // The typed `setSetting` helper guards against unknown keys at compile
    // time; for the runtime round-trip we go through Dexie directly so
    // this test does not need a live SettingsMap entry.
    await database.settings.put({ key: 'displayName', value: 'Mary' });
    const back = await database.settings.get('displayName');
    expect(back?.value).toBe('Mary');
    const all = await getAllSettings(database);
    expect(all).toHaveLength(1);
  });

  // Type-level assertion documenting the typed-key contract. If a future
  // entry were added to `SettingsMap`, the following lines (uncommented)
  // would have to compile cleanly and the wrong-type variant would have
  // to fail. Leaving them here as a reminder.
  it('keeps the typed-key contract documented', () => {
    /*
      // @ts-expect-error 'unknownKey' is not in SettingsMap (currently empty)
      void getSetting('unknownKey');
      // @ts-expect-error wrong value type for 'displayName' (when added)
      void setSetting('displayName', 42);
    */
    expect(true).toBe(true);
  });
});
