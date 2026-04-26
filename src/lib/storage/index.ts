/**
 * Public API for the persistence layer.
 *
 * Components import only from `@/lib/storage` and never reach into
 * individual files. Dexie types are intentionally not re-exported — the
 * surface is plain async functions returning typed records.
 *
 * Owner: indexeddb-expert
 */

// Database handle (exported for tests and rare cases where a caller
// genuinely needs the live instance, e.g., a debug panel that wants to
// `db.close()` before deletion).
export { db, EuchreDb } from './db';

// Game CRUD
export { saveGame, updateGame, getGame, listGames, deleteGame } from './games';

// Hand CRUD
export {
  saveHand,
  saveHands,
  getHandsForGame,
  deleteHandsForGame,
  recordFromResult,
  boolToIndexed,
  indexedToBool,
} from './hands';

// Settings (IndexedDB-backed, currently empty map)
export { getSetting, setSetting, getAllSettings } from './settings';

// UI prefs (localStorage-backed)
export { getPref, setPref, clearPref } from './prefs';

// Stats
export {
  winRateByDifficulty,
  euchreRate,
  trumpDistribution,
  goingAloneStats,
  handsPlayed,
  recentGames,
  scoringDistribution,
} from './stats';

// Export / import
export { exportAll, importAll, ImportError } from './export-import';

// Types — only the storage-internal surface, not the engine types
export type {
  GameRecord,
  HandRecord,
  SettingRecord,
  ReplayRecord,
  ExportFile,
  Difficulty,
  GameKind,
  Winner,
  IndexedBool,
  SettingsMap,
  PrefsMap,
} from './types';
