/**
 * Storage-internal types.
 *
 * These types describe the shape of records persisted in IndexedDB. They are
 * intentionally separate from the in-memory game-engine types (`GameState`,
 * `HandResult`, etc.) so the persistence layer can evolve its schema without
 * dragging the engine along.
 *
 * Booleans that participate in IndexedDB indexes are stored as `0 | 1` because
 * Dexie / IndexedDB cannot index `true` / `false` directly.
 *
 * Owner: indexeddb-expert
 */

import type {
  HandId,
  Partnership,
  Score,
  Seat,
  Suit,
  TricksWon,
  Variants,
} from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Shared scalars                                                     */
/* ------------------------------------------------------------------ */

/**
 * Difficulty tier the user selected for the game.
 *
 * Mirrors the difficulty tiers in CLAUDE.md ("AI Difficulty Tiers").
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Game kinds. Persisted on every `GameRecord` so multiple games can coexist
 * in one database. Euchre is MVP; the others are reserved for future
 * additions (Blackjack, Poker, Cribbage, Hearts, Spades).
 */
export type GameKind =
  | 'euchre'
  | 'blackjack'
  | 'poker'
  | 'cribbage'
  | 'hearts'
  | 'spades';

/**
 * Storage-side flag for "did the human player's side win" — encoded as a
 * `Partnership` for euchre (MVP). Future games may need different shapes,
 * but `Partnership` keeps the index narrow today and the value can be
 * widened with a schema bump.
 */
export type Winner = Partnership;

/**
 * `0 | 1` boolean alias for indexed boolean fields. Dexie/IndexedDB cannot
 * index `true`/`false`, so any boolean we want to filter or count by lives
 * as a 0/1 integer in the schema.
 */
export type IndexedBool = 0 | 1;

/* ------------------------------------------------------------------ */
/* Game record                                                        */
/* ------------------------------------------------------------------ */

/**
 * One row per game played.
 *
 * `id` is auto-incremented by Dexie. The engine's `GameId` (a branded
 * string) is preserved separately in `engineGameId` so a save can be
 * correlated back to an in-memory game without colliding with Dexie's
 * numeric primary key.
 */
export type GameRecord = {
  /** Auto-incrementing primary key. Optional when inserting. */
  readonly id?: number;
  /** Branded engine id, kept for cross-referencing replays. */
  readonly engineGameId: string;
  /** Which game this row is for. */
  readonly gameKind: GameKind;
  /** Difficulty tier. */
  readonly difficulty: Difficulty;
  /** Variant flags in effect for this game. Stored as JSON. */
  readonly variants: Variants;
  /** Number of decks in the shoe (1 for euchre; up to 6 for future blackjack). */
  readonly deckCount: number;
  /** Epoch ms when the game started. */
  readonly startedAt: number;
  /** Epoch ms when the game ended. `null` while still in progress. */
  readonly endedAt: number | null;
  /** Total elapsed ms (`endedAt - startedAt`). `null` while in progress. */
  readonly durationMs: number | null;
  /** Winning partnership. `null` if the game did not finish. */
  readonly winner: Winner | null;
  /** Final score at game end. `null` while in progress. */
  readonly finalScore: Score | null;
};

/* ------------------------------------------------------------------ */
/* Hand record                                                        */
/* ------------------------------------------------------------------ */

/**
 * One row per hand within a game. Mirrors the engine's `HandResult` plus
 * the foreign key to its parent game and an explicit per-game ordinal.
 */
export type HandRecord = {
  /** Auto-incrementing primary key. Optional when inserting. */
  readonly id?: number;
  /** FK to `GameRecord.id`. */
  readonly gameId: number;
  /** Branded engine hand id (preserved for replays). */
  readonly engineHandId: HandId;
  /** Zero-based ordinal within the game (0 = first hand played). */
  readonly index: number;
  /** Seat that dealt the hand. */
  readonly dealer: Seat;
  /** Partnership that called trump. */
  readonly maker: Partnership;
  /** Trump suit. */
  readonly trump: Suit;
  /** Stored 0/1 because the field is indexed. */
  readonly alone: IndexedBool;
  /** Trick tally. */
  readonly tricksWon: TricksWon;
  /** Points awarded to each side this hand. */
  readonly pointsAwarded: Score;
  /** 0/1: makers were euchred (took fewer than 3 tricks). Indexed. */
  readonly euchred: IndexedBool;
  /** Bidding step that produced this hand's trump. */
  readonly orderedUpInRound: 1 | 2 | 'stick';
};

/* ------------------------------------------------------------------ */
/* Setting record                                                     */
/* ------------------------------------------------------------------ */

/**
 * Persistent user-data setting. Empty for MVP — UI prefs (theme, card-back,
 * difficulty default, sound) live in `localStorage` via `prefs.ts`. This
 * table is reserved for future user-data (e.g., display name) that should
 * round-trip through `exportAll`/`importAll`.
 */
export type SettingRecord = {
  readonly key: string;
  readonly value: unknown;
};

/* ------------------------------------------------------------------ */
/* Replay record (defined but unused in MVP)                          */
/* ------------------------------------------------------------------ */

/**
 * Captured replay for hard-tier debugging. Empty in MVP; the table exists
 * so future writes don't need a schema bump.
 */
export type ReplayRecord = {
  readonly id?: number;
  readonly gameId: number;
  readonly seed: string;
  readonly actions: readonly unknown[];
};

/* ------------------------------------------------------------------ */
/* Settings map (typed key→value lookup)                              */
/* ------------------------------------------------------------------ */

/**
 * Discriminated key→type map for the IndexedDB `settings` table.
 *
 * MVP ships none; this is the slot for future user-data settings that
 * survive a clear-cache and need to round-trip in `exportAll`. UI prefs
 * (theme, card-back, etc.) belong in `prefs.ts` (localStorage).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty for MVP; bump schema to extend.
export type SettingsMap = {};

/* ------------------------------------------------------------------ */
/* Prefs map (localStorage-backed)                                    */
/* ------------------------------------------------------------------ */

/**
 * Discriminated key→type map for the `localStorage` UI-preferences store.
 *
 * Per CLAUDE.md "Storage & Stats", these are UI-only and per-device — not
 * included in `exportAll`/`importAll`.
 */
export type PrefsMap = {
  cardBack: string;
  darkMode: boolean;
  soundOn: boolean;
  lastDifficulty: Difficulty;
};

/* ------------------------------------------------------------------ */
/* Export file format                                                 */
/* ------------------------------------------------------------------ */

/**
 * Wire shape of a JSON export. `prefs` are intentionally omitted — they're
 * per-device UI state, not user data.
 */
export type ExportFile = {
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly games: readonly GameRecord[];
  readonly hands: readonly HandRecord[];
  readonly settings: readonly SettingRecord[];
};
