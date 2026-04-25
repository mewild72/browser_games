/**
 * Hand-strength and inference helpers shared by Medium (and future Hard).
 *
 * All functions here are pure: they take a hand, trump, and (for inference)
 * a public game record, and return numbers / sets. No bot state is kept
 * between calls — Medium recomputes voids and card-counts on every move
 * by walking the engine's `completedTricks` + `currentTrick` history.
 *
 * Owner: ai-strategy-expert
 */

import type {
  Card,
  CompletedTrick,
  GameState,
  PlayingState,
  Seat,
  Suit,
  TrickPlay,
} from '@/lib/types';
import { allSuits, sameColorAs, seatsClockwise } from '@/lib/types';
import { effectiveSuit, isLeftBower, isRightBower, isTrump } from '@/lib/euchre';

/* ------------------------------------------------------------------ */
/* Trump / bower / ace counts                                         */
/* ------------------------------------------------------------------ */

/** Number of trump cards in `hand` under the candidate `trump` suit. */
export function trumpCount(hand: readonly Card[], trump: Suit): number {
  return hand.reduce((n, c) => (isTrump(c, trump) ? n + 1 : n), 0);
}

/**
 * Number of bowers in `hand` under the candidate `trump` suit.
 * Returns 0, 1, or 2.
 */
export function bowerCount(hand: readonly Card[], trump: Suit): number {
  return hand.reduce(
    (n, c) => (isRightBower(c, trump) || isLeftBower(c, trump) ? n + 1 : n),
    0,
  );
}

/** True iff the hand contains the right bower. */
export function hasRightBower(hand: readonly Card[], trump: Suit): boolean {
  return hand.some((c) => isRightBower(c, trump));
}

/** True iff the hand contains the left bower. */
export function hasLeftBower(hand: readonly Card[], trump: Suit): boolean {
  return hand.some((c) => isLeftBower(c, trump));
}

/**
 * Number of aces of OFF-TRUMP suits in the hand. The trump-suit ace is
 * already accounted for by `trumpCount`. The Left Bower's native suit
 * still counts as an off-suit for ace purposes (e.g., trump=hearts,
 * Ace of Diamonds is an off-suit ace; the Jack of Diamonds is the left
 * bower / trump, not an off-suit card).
 */
export function offSuitAces(hand: readonly Card[], trump: Suit): number {
  return hand.reduce((n, c) => {
    if (c.rank !== 'A') return n;
    if (isTrump(c, trump)) return n; // trump ace doesn't count here
    return n + 1;
  }, 0);
}

/**
 * Number of suits in which the hand is void, EXCLUDING trump.
 *
 * "Void" here means no card whose effective suit equals the named suit,
 * i.e., after the Left Bower has been moved into trump. A 5-card hand
 * has at most 2 off-suit voids (since at least one card must be in some
 * non-trump suit unless the hand is all trump, in which case 3 voids).
 */
export function offSuitVoidCount(hand: readonly Card[], trump: Suit): number {
  let voids = 0;
  for (const s of allSuits) {
    if (s === trump) continue;
    const has = hand.some((c) => effectiveSuit(c, trump) === s);
    if (!has) voids++;
  }
  return voids;
}

/* ------------------------------------------------------------------ */
/* Hand strength                                                      */
/* ------------------------------------------------------------------ */

/**
 * Hand strength score under a candidate trump suit.
 *
 * Calibrated by self-play. The constants below are tuned so:
 *   - A canonical "lay-down" (both bowers + ace of trump + another trump)
 *     scores well above the alone threshold (~12).
 *   - A typical "order it up with confidence" hand (right bower + ace +
 *     one other trump) scores around the order-up threshold (~7).
 *   - A bare "I have 2 trump and an off ace" hand scores around the round-2
 *     threshold (~5).
 *
 * Formula:
 *   3.0 per right bower         (the strongest single card)
 *   2.5 per left bower
 *   1.5 per other trump card    (multiplier scales with trump density)
 *   1.0 per off-suit ace
 *   0.6 per off-suit void       (bonus: voids let you trump in early)
 *   +0.5 if dealer's-pickup is the right bower (going to dealer's team
 *        in round 1) — caller passes that signal via `kittyTopCard`
 *
 * Returns a non-negative number. The numeric scale is internal to this
 * module — never persist it.
 */
export function handStrength(input: {
  hand: readonly Card[];
  trump: Suit;
  /** Top card of the kitty if visible (round 1 only). */
  kittyTopCard?: Card | undefined;
  /** True if `seat` (or partner) would be the maker. */
  asMaker: boolean;
}): number {
  const { hand, trump, kittyTopCard, asMaker } = input;

  const rights = hand.filter((c) => isRightBower(c, trump)).length;
  const lefts = hand.filter((c) => isLeftBower(c, trump)).length;
  const otherTrump = trumpCount(hand, trump) - rights - lefts;
  const offAces = offSuitAces(hand, trump);
  const voids = offSuitVoidCount(hand, trump);

  let score = 0;
  score += 3.0 * rights;
  score += 2.5 * lefts;
  score += 1.5 * otherTrump;
  score += 1.0 * offAces;
  score += 0.6 * voids;

  // Round-1 kitty-pickup adjustment: if the kitty's top card is a strong
  // trump (right bower especially) and `asMaker` is true, the maker (or
  // their partner who is the dealer) gets a boost — that card is going
  // into a hand on their team.
  if (kittyTopCard !== undefined && asMaker) {
    if (isRightBower(kittyTopCard, trump)) score += 0.5;
    else if (isTrump(kittyTopCard, trump)) score += 0.25;
  }

  return score;
}

/* ------------------------------------------------------------------ */
/* Card counting / void inference                                     */
/* ------------------------------------------------------------------ */

/**
 * Set of (suit, rank) keys for cards already played in the current hand.
 * Walks completed tricks + the in-progress trick. Useful for inferring
 * what's still out.
 *
 * Keys are `<suit>:<rank>` strings — single-deck euchre, no deckId needed.
 */
export function playedCardKeys(state: PlayingState): Set<string> {
  const keys = new Set<string>();
  for (const t of state.completedTricks) {
    for (const p of t.plays) {
      keys.add(cardKey(p.card));
    }
  }
  for (const p of state.currentTrick) {
    keys.add(cardKey(p.card));
  }
  return keys;
}

/** Stable key for a card (single-deck only — euchre is single-deck). */
export function cardKey(c: Card): string {
  return `${c.suit}:${c.rank}`;
}

/**
 * Per-seat inferred suit voids for the active hand.
 *
 * If a player has failed to follow a led suit at any point in this hand,
 * they're recorded as void in that suit. "Effective suit" applies — the
 * Left Bower follows trump, not its native suit, so a player who plays
 * the Left Bower on a trump lead has NOT revealed they're void in the
 * left-bower's native suit.
 *
 * Returns a Map keyed by Seat where each value is a Set of suits the
 * seat is known to be void in. The seat's own seat is included with an
 * empty set if not void in anything yet.
 */
export function inferredVoids(state: PlayingState): Map<Seat, Set<Suit>> {
  const out = new Map<Seat, Set<Suit>>();
  for (const s of seatsClockwise) out.set(s, new Set<Suit>());

  const tricks: { plays: readonly TrickPlay[] }[] = [
    ...state.completedTricks,
    { plays: state.currentTrick },
  ];

  for (const trick of tricks) {
    if (trick.plays.length === 0) continue;
    // Led suit is the effective suit of the first card.
    const led = effectiveSuit(trick.plays[0]!.card, state.trump);
    for (let i = 1; i < trick.plays.length; i++) {
      const play = trick.plays[i]!;
      const eff = effectiveSuit(play.card, state.trump);
      if (eff !== led) {
        // Failed to follow → void in the led suit.
        const set = out.get(play.seat)!;
        set.add(led);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Best candidate trump suit by `handStrength` from the four suits.
 * Excludes `excludeSuit` (used for the round-2 rejected suit).
 *
 * Returns null if no suit has positive strength (rare — almost every hand
 * has *some* card in *some* suit).
 */
export function bestTrumpCandidate(
  hand: readonly Card[],
  excludeSuit: Suit | null,
  asMaker: boolean,
): { suit: Suit; score: number } | null {
  let best: { suit: Suit; score: number } | null = null;
  for (const s of allSuits) {
    if (s === excludeSuit) continue;
    const score = handStrength({ hand, trump: s, asMaker });
    if (best === null || score > best.score) {
      best = { suit: s, score };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Same-color helper for trump candidates                             */
/* ------------------------------------------------------------------ */

/**
 * Whether `candidate` is the same color as `rejected`. Used by some
 * heuristics ("calling next" vs "calling across") but NOT currently
 * applied by Medium — left here for future tuning.
 */
export function isSameColor(candidate: Suit, rejected: Suit): boolean {
  return sameColorAs[rejected] === candidate;
}

/* ------------------------------------------------------------------ */
/* Public-trick helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * For `state.currentTrick`, who is currently winning the in-progress trick
 * given trump. Returns `null` if the trick is empty.
 */
export function currentTrickWinner(
  trick: readonly TrickPlay[],
  trump: Suit,
): { seat: Seat; card: Card } | null {
  if (trick.length === 0) return null;
  const led = effectiveSuit(trick[0]!.card, trump);
  let bestSeat = trick[0]!.seat;
  let bestCard = trick[0]!.card;
  let bestStrength = strengthFor(bestCard, trump, led);
  for (let i = 1; i < trick.length; i++) {
    const p = trick[i]!;
    const s = strengthFor(p.card, trump, led);
    if (s > bestStrength) {
      bestStrength = s;
      bestSeat = p.seat;
      bestCard = p.card;
    }
  }
  return { seat: bestSeat, card: bestCard };
}

/**
 * Inline strength approximation that mirrors the engine's `cardStrength`
 * scale. Kept here so heuristics aren't dependent on importing the
 * non-exported strength constant.
 */
function strengthFor(card: Card, trump: Suit, led: Suit): number {
  if (isRightBower(card, trump)) return 100;
  if (isLeftBower(card, trump)) return 99;
  if (isTrump(card, trump)) {
    const order: Record<string, number> = {
      '9': 50,
      '10': 51,
      Q: 52,
      K: 53,
      A: 54,
    };
    return order[card.rank] ?? 50;
  }
  if (card.suit === led) {
    const order: Record<string, number> = {
      '9': 0,
      '10': 1,
      J: 2,
      Q: 3,
      K: 4,
      A: 5,
    };
    return order[card.rank] ?? 0;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Game-state guards                                                  */
/* ------------------------------------------------------------------ */

/**
 * Type guard for the playing phase. Used by lead/follow logic that needs
 * the rich playing-state fields.
 */
export function isPlaying(state: GameState): state is PlayingState {
  return state.phase === 'playing';
}
