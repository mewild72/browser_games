/**
 * Typed get/set against the IndexedDB `settings` table.
 *
 * MVP ships zero typed keys (the `SettingsMap` is empty by design). The
 * surface still exists so future user-data settings can plug in via a
 * single key→type entry — no schema bump needed.
 *
 * UI prefs (theme, card-back, last difficulty, sound) live in
 * `prefs.ts` against `localStorage`. Do not put them here.
 *
 * Owner: indexeddb-expert
 */

import { db, EuchreDb } from './db';
import type { SettingsMap, SettingRecord } from './types';

/**
 * Read a setting. Returns `undefined` if the key has not been set.
 *
 * The generic narrows the value type to `SettingsMap[K]`, so calling
 * `getSetting('foo')` (when `foo` is keyed in `SettingsMap`) returns the
 * declared type and not `unknown`.
 */
export async function getSetting<K extends keyof SettingsMap & string>(
  key: K,
  database: EuchreDb = db,
): Promise<SettingsMap[K] | undefined> {
  const row = await database.settings.get(key);
  if (row === undefined) return undefined;
  // The map ties the value type to the key statically; the runtime payload
  // is `unknown` because Dexie returns generic JSON. The cast is the
  // single point where dynamic→declared narrowing happens.
  return row.value as SettingsMap[K];
}

/**
 * Write a setting. The generic forces the value to match the declared
 * type for the key, so `setSetting('foo', 42)` is a compile error if
 * `foo` is keyed as `string`.
 */
export async function setSetting<K extends keyof SettingsMap & string>(
  key: K,
  value: SettingsMap[K],
  database: EuchreDb = db,
): Promise<void> {
  await database.settings.put({ key, value });
}

/**
 * Read every setting row. Used by `exportAll`. Returns the raw
 * `SettingRecord` shape rather than a strongly-typed map because export is
 * a transport concern, not a typed-API concern.
 */
export async function getAllSettings(
  database: EuchreDb = db,
): Promise<readonly SettingRecord[]> {
  return database.settings.toArray();
}
