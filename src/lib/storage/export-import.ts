/**
 * Whole-database export and import.
 *
 * `exportAll()` produces a `JSON.stringify`-ready object suitable for
 * download as a `.json` file. `importAll(file)` is **destructive** — it
 * clears the existing tables and replaces them with the file's contents.
 * UI must require explicit confirmation before calling.
 *
 * UI prefs (localStorage) are intentionally NOT included — they're
 * per-device.
 *
 * Owner: indexeddb-expert
 */

import { db, EuchreDb } from './db';
import type { ExportFile, GameRecord, HandRecord, SettingRecord } from './types';

/**
 * Distinct error class for import failures so callers can `instanceof`-
 * branch on user-facing messages vs unexpected exceptions.
 */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/**
 * Export every row of every table into a single JSON-friendly object.
 *
 * `schemaVersion` records the current Dexie verno so a later import can
 * decide whether to reject (file is from a newer app), accept as-is
 * (same version), or migrate (file is older).
 */
export async function exportAll(database: EuchreDb = db): Promise<ExportFile> {
  const [games, hands, settings] = await Promise.all([
    database.games.toArray(),
    database.hands.toArray(),
    database.settings.toArray(),
  ]);
  return {
    schemaVersion: database.verno,
    exportedAt: new Date().toISOString(),
    games,
    hands,
    settings,
  };
}

/**
 * Import a previously-exported file. The current database is cleared
 * first; the file's contents become the only data.
 *
 * Errors:
 *   - The file's schemaVersion is greater than this app's: throw
 *     `ImportError` ("file is from a newer version").
 *   - The file shape is malformed: throw `ImportError`.
 *
 * Older-version files are accepted as-is. Dexie's open-time upgrade
 * chain has already brought the live schema forward; the rows in an
 * older export must already be valid for older schemas, and our v1
 * schema is the only one that exists today, so no per-row migration is
 * needed yet. When v2 ships, this is the function that has to learn
 * how to translate v1 rows.
 *
 * Auto-incremented `id` fields are preserved so cross-references inside
 * the file (hands→games via `gameId`, replays→games) still resolve.
 */
export async function importAll(
  file: ExportFile,
  database: EuchreDb = db,
): Promise<void> {
  if (!isValidExportShape(file)) {
    throw new ImportError('Import file is malformed.');
  }
  if (file.schemaVersion > database.verno) {
    throw new ImportError(
      `Import file schemaVersion ${file.schemaVersion} is newer than the app's ${database.verno}. Update the app first.`,
    );
  }
  await database.transaction(
    'rw',
    database.games,
    database.hands,
    database.settings,
    database.replays,
    async () => {
      await Promise.all([
        database.games.clear(),
        database.hands.clear(),
        database.settings.clear(),
        database.replays.clear(),
      ]);
      // Preserve ids — `bulkPut` accepts records that include their
      // primary key and writes them through verbatim. `bulkAdd` would
      // also work because the tables are now empty, but `bulkPut` is
      // more forgiving if the file contains intentional id reuse.
      if (file.games.length > 0) {
        await database.games.bulkPut(file.games as GameRecord[]);
      }
      if (file.hands.length > 0) {
        await database.hands.bulkPut(file.hands as HandRecord[]);
      }
      if (file.settings.length > 0) {
        await database.settings.bulkPut(file.settings as SettingRecord[]);
      }
    },
  );
}

/**
 * Lightweight shape check on the export envelope. Doesn't validate every
 * row — that's the schema's job at insert time. Just confirms the
 * top-level fields exist and have the right primitive types.
 */
function isValidExportShape(file: unknown): file is ExportFile {
  if (file === null || typeof file !== 'object') return false;
  const f = file as Record<string, unknown>;
  return (
    typeof f.schemaVersion === 'number' &&
    typeof f.exportedAt === 'string' &&
    Array.isArray(f.games) &&
    Array.isArray(f.hands) &&
    Array.isArray(f.settings)
  );
}
