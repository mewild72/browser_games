/**
 * Vitest setup file. Registers an in-memory IndexedDB shim on the global
 * scope so Dexie can run inside the jsdom environment.
 *
 * The side-effect import installs `indexedDB`, `IDBKeyRange`, and the
 * supporting types; without it, Dexie throws `MissingAPIError`.
 *
 * This is loaded for every test file, but is a no-op for tests that do
 * not touch IndexedDB — the only cost is the import itself.
 *
 * Owner: indexeddb-expert
 */
import 'fake-indexeddb/auto';
