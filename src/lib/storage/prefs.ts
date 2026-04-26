/**
 * UI preference helpers backed by `localStorage`.
 *
 * Per CLAUDE.md "Storage & Stats", the boundary is:
 *   - IndexedDB: game data (games, hands, replays) and persistent
 *     user-data settings that should round-trip via export/import.
 *   - localStorage: UI prefs the app needs synchronously on first paint
 *     (theme, card-back, last difficulty, sound on/off).
 *
 * Keys are namespaced with `euchre.pref.` so a stray colliding key in
 * another app on the same `file://` origin (or in browser DevTools) is
 * unambiguous.
 *
 * Owner: indexeddb-expert
 */

import type { PrefsMap } from './types';

/** Namespace prefix on every persisted localStorage key. */
const NS = 'euchre.pref.';

/**
 * Build the namespaced storage key for a given pref.
 */
function storageKey<K extends keyof PrefsMap & string>(key: K): string {
  return NS + key;
}

/**
 * Read a UI preference synchronously. Returns `undefined` if absent or
 * if `localStorage` is unavailable (e.g., private browsing without
 * storage, or a Node test environment with no DOM shim).
 */
export function getPref<K extends keyof PrefsMap & string>(
  key: K,
): PrefsMap[K] | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const raw = localStorage.getItem(storageKey(key));
  if (raw === null) return undefined;
  try {
    // Values are JSON-encoded so booleans / strings round-trip without
    // ambiguity. A bare `localStorage.setItem('x', false)` would write
    // the string "false" and parse back wrong.
    return JSON.parse(raw) as PrefsMap[K];
  } catch {
    // Corrupt entry — treat as unset rather than throwing.
    return undefined;
  }
}

/**
 * Write a UI preference. No-op if `localStorage` is unavailable; UI prefs
 * are best-effort and a missing store should not crash the app.
 */
export function setPref<K extends keyof PrefsMap & string>(
  key: K,
  value: PrefsMap[K],
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — swallow. Pref writes are
    // never load-bearing.
  }
}

/**
 * Remove a UI preference, falling back to the implicit default the next
 * time `getPref` is called.
 */
export function clearPref<K extends keyof PrefsMap & string>(key: K): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}
