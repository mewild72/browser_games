/**
 * Aggregate queries for the stats view.
 *
 * Each function returns a plain typed result — no Dexie collections leak.
 * All filters accept `gameKind` (default `'euchre'`) so future blackjack
 * stats reuse the same shape without touching this file's signatures.
 *
 * The dataset is tiny (a power user produces hundreds of hands, not
 * millions), so most queries `.toArray()` and reduce in memory. Index
 * filters are used where the predicate is a single-column equality on an
 * indexed field (`gameKind`, `difficulty`).
 *
 * Owner: indexeddb-expert
 */

import { db, EuchreDb } from './db';
import type { Suit, Partnership } from '@/lib/types';
import type { Difficulty, GameKind, GameRecord, HandRecord } from './types';

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Pull all games of a given kind. Single-column indexed equality, no sort.
 */
async function gamesOfKind(
  kind: GameKind,
  database: EuchreDb,
): Promise<readonly GameRecord[]> {
  return database.games.where('gameKind').equals(kind).toArray();
}

/**
 * Pull all hands belonging to games of a given kind.
 *
 * Hands don't carry `gameKind` directly (no need — the FK is enough), so
 * we resolve the set of game ids first and then filter hands by FK.
 */
async function handsOfKind(
  kind: GameKind,
  database: EuchreDb,
): Promise<readonly HandRecord[]> {
  const games = await gamesOfKind(kind, database);
  if (games.length === 0) return [];
  const idSet = new Set<number>();
  for (const g of games) {
    if (g.id !== undefined) idSet.add(g.id);
  }
  // `.anyOf` matches any value in the array against the indexed `gameId`.
  return database.hands
    .where('gameId')
    .anyOf(Array.from(idSet))
    .toArray();
}

/* ------------------------------------------------------------------ */
/* Win rate by difficulty                                             */
/* ------------------------------------------------------------------ */

/**
 * Fraction of completed games at the given difficulty that the human side
 * (north-south) won. Range [0, 1]. Returns `0` if no completed games at
 * that difficulty.
 *
 * In-progress games (`endedAt === null`) are excluded — a half-played game
 * has no winner to count.
 */
export async function winRateByDifficulty(
  difficulty: Difficulty,
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<number> {
  const games = await database.games
    .where('difficulty')
    .equals(difficulty)
    .filter((g) => g.gameKind === gameKind && g.endedAt !== null)
    .toArray();
  if (games.length === 0) return 0;
  const wins = games.filter((g) => g.winner === 'ns').length;
  return wins / games.length;
}

/* ------------------------------------------------------------------ */
/* Euchre rate                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fraction of hands where the makers were euchred, split by which side
 * was making. Returns rates as fractions of the total hands played.
 *
 * `asMakers`    — fraction of all hands where the human side called and got euchred
 * `asDefenders` — fraction of all hands where the human side defended and won the euchre
 *
 * Both denominators are total hand count for the game kind, so the two
 * numbers can be compared directly against each other.
 */
export async function euchreRate(
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<{ readonly asMakers: number; readonly asDefenders: number }> {
  const hands = await handsOfKind(gameKind, database);
  if (hands.length === 0) return { asMakers: 0, asDefenders: 0 };
  let humanMakerEuchred = 0;
  let humanDefenderEuchred = 0;
  for (const h of hands) {
    if (h.euchred !== 1) continue;
    if (h.maker === 'ns') humanMakerEuchred++;
    else humanDefenderEuchred++;
  }
  return {
    asMakers: humanMakerEuchred / hands.length,
    asDefenders: humanDefenderEuchred / hands.length,
  };
}

/* ------------------------------------------------------------------ */
/* Trump distribution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Count of hands per trump suit. Useful for "what's the most-called
 * trump" charts.
 */
export async function trumpDistribution(
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<Record<Suit, number>> {
  const hands = await handsOfKind(gameKind, database);
  const out: Record<Suit, number> = {
    clubs: 0,
    diamonds: 0,
    hearts: 0,
    spades: 0,
  };
  for (const h of hands) {
    out[h.trump] += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Going-alone stats                                                  */
/* ------------------------------------------------------------------ */

/**
 * Going-alone metrics:
 *
 *   `callRate`    — fraction of all hands where the maker went alone.
 *   `successRate` — fraction of those alone calls where the maker side
 *                   actually scored points (any positive points to maker).
 *
 * If there are no alone calls, `successRate` is `0`.
 */
export async function goingAloneStats(
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<{ readonly callRate: number; readonly successRate: number }> {
  const hands = await handsOfKind(gameKind, database);
  if (hands.length === 0) return { callRate: 0, successRate: 0 };
  const alone = hands.filter((h) => h.alone === 1);
  const succeeded = alone.filter((h) => {
    const makerSide: Partnership = h.maker;
    const points =
      makerSide === 'ns' ? h.pointsAwarded.ns : h.pointsAwarded.ew;
    return points > 0;
  });
  return {
    callRate: alone.length / hands.length,
    successRate: alone.length === 0 ? 0 : succeeded.length / alone.length,
  };
}

/* ------------------------------------------------------------------ */
/* Hands played                                                       */
/* ------------------------------------------------------------------ */

/**
 * Total hands played for a game kind. Cheap — Dexie counts via the index.
 */
export async function handsPlayed(
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<number> {
  const hands = await handsOfKind(gameKind, database);
  return hands.length;
}

/* ------------------------------------------------------------------ */
/* Recent games                                                       */
/* ------------------------------------------------------------------ */

/**
 * The N most recent games of a given kind, newest first by `startedAt`.
 *
 * `limit` is required because the UI controls the page size; passing 0 or
 * a negative number returns an empty list.
 */
export async function recentGames(
  limit: number,
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<readonly GameRecord[]> {
  if (limit <= 0) return [];
  return database.games
    .orderBy('startedAt')
    .reverse()
    .filter((g) => g.gameKind === gameKind)
    .limit(limit)
    .toArray();
}

/* ------------------------------------------------------------------ */
/* Scoring distribution                                               */
/* ------------------------------------------------------------------ */

/**
 * How often each per-hand point outcome occurs, from the makers' point of
 * view:
 *
 *   '0' — makers scored 0 (they were euchred — defenders got 2)
 *   '1' — makers scored 1 (3 or 4 tricks)
 *   '2' — makers scored 2 (march, not alone)
 *   '4' — makers scored 4 (lone march)
 *
 * Sums to total hands.
 */
export async function scoringDistribution(
  gameKind: GameKind = 'euchre',
  database: EuchreDb = db,
): Promise<{
  readonly '0': number;
  readonly '1': number;
  readonly '2': number;
  readonly '4': number;
}> {
  const hands = await handsOfKind(gameKind, database);
  const out = { '0': 0, '1': 0, '2': 0, '4': 0 };
  for (const h of hands) {
    if (h.euchred === 1) {
      out['0'] += 1;
      continue;
    }
    const makerPoints =
      h.maker === 'ns' ? h.pointsAwarded.ns : h.pointsAwarded.ew;
    if (makerPoints === 1) out['1'] += 1;
    else if (makerPoints === 2) out['2'] += 1;
    else if (makerPoints === 4) out['4'] += 1;
    // Any other value is a data inconsistency — silently skip rather than
    // crash the stats view.
  }
  return out;
}
