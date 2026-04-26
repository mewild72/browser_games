/**
 * Dexie database definition.
 *
 * Schema is versioned. **Never mutate an existing version's `.stores()`** —
 * always add a new `version(n+1).stores(...).upgrade(...)` call when the
 * schema needs to change. Old version definitions stay in place forever so
 * users on older DBs can step forward through the upgrade chain.
 *
 * Owner: indexeddb-expert
 */

import Dexie, { type Table } from 'dexie';
import type {
  GameRecord,
  HandRecord,
  ReplayRecord,
  SettingRecord,
} from './types';

export class EuchreDb extends Dexie {
  /**
   * `!` here is a Dexie convention — Dexie populates these properties from
   * the schema string at construction time, so TS's strict-property-init
   * check is intentionally bypassed.
   */
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned by Dexie.version().stores()
  games!: Table<GameRecord, number>;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned by Dexie.version().stores()
  hands!: Table<HandRecord, number>;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned by Dexie.version().stores()
  settings!: Table<SettingRecord, string>;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- assigned by Dexie.version().stores()
  replays!: Table<ReplayRecord, number>;

  constructor(name = 'euchre') {
    super(name);

    /*
     * Schema v1.
     *
     * games:    auto id, plus indexes on the columns aggregate queries filter on
     *           (startedAt for chronological lists, endedAt to distinguish
     *           in-progress games, gameKind/difficulty/winner for stats,
     *           deckCount so future blackjack rows can be filtered).
     *
     * hands:    auto id, FK to games (gameId), compound index on
     *           [gameId+index] so per-game hand history is sortable in O(log n)
     *           without a sort step. maker/euchred/trump/alone are indexed for
     *           filter-and-count stats.
     *
     * settings: keyed by string, unique (`&key`).
     *
     * replays:  auto id, FK to games. Defined now so a future write doesn't
     *           require a schema bump.
     */
    this.version(1).stores({
      games:
        '++id, startedAt, endedAt, gameKind, difficulty, winner, deckCount',
      hands: '++id, gameId, [gameId+index], maker, euchred, trump, alone',
      settings: '&key',
      replays: '++id, gameId',
    });
  }
}

/**
 * Singleton database handle. Production code imports this; tests construct
 * their own instance against `fake-indexeddb` and use `db.delete()` to
 * tear down between cases.
 */
export const db: EuchreDb = new EuchreDb();
