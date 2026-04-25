/**
 * Easy bot.
 *
 * Behavior:
 *   - Bidding: orders up / calls trump only when the hand has obvious
 *     strength: ≥ 2 trump that includes a bower, OR 3+ trump regardless
 *     of bowers. Otherwise passes (subject to stick-the-dealer being
 *     forced to call).
 *   - When stuck (round 2, dealer, must-call): calls the suit with the
 *     highest naive trump count.
 *   - Never goes alone.
 *   - Plays a random legal card. Tie-breaks via the injected RNG.
 *   - Discards (when ordered up) the lowest-strength card in hand.
 *
 * Easy is intentionally simple — it does NOT track played cards or
 * voids, and its bidding is purely a count-the-trump check.
 *
 * Owner: ai-strategy-expert
 */

import type { Action, Card, GameState, RNG, Seat, Suit } from '@/lib/types';
import type { Bot } from './types';
import { allSuits } from '@/lib/types';
import { legalActions } from '@/lib/euchre';
import { bowerCount, trumpCount } from './heuristics';
import { pickWeakest } from './selection';

/**
 * True if the hand has "obvious strength" under the candidate trump.
 *
 * Easy's rule: ≥ 2 trump including a bower, OR ≥ 3 trump.
 */
function easyShouldCall(hand: readonly Card[], trump: Suit): boolean {
  const t = trumpCount(hand, trump);
  const b = bowerCount(hand, trump);
  if (t >= 3) return true;
  if (t >= 2 && b >= 1) return true;
  return false;
}

/** Choose the suit with highest trump count. Used when stuck. */
function bestStuckSuit(
  hand: readonly Card[],
  excludeSuit: Suit | null,
  rng: RNG,
): Suit {
  let best: Suit | null = null;
  let bestCount = -1;
  // Iterate suits in a stable order, but tie-break with rng for variety.
  const suits = [...allSuits];
  // Light shuffle with rng to avoid always preferring 'clubs'.
  for (let i = suits.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [suits[i], suits[j]] = [suits[j]!, suits[i]!];
  }
  for (const s of suits) {
    if (s === excludeSuit) continue;
    const t = trumpCount(hand, s);
    if (t > bestCount) {
      bestCount = t;
      best = s;
    }
  }
  // best must be non-null because we have at least 3 candidate suits.
  return best as Suit;
}

/** Choose a random element from a non-empty array via the injected RNG. */
function pickRandom<T>(arr: readonly T[], rng: RNG): T {
  if (arr.length === 0) {
    throw new Error('pickRandom: empty array');
  }
  return arr[Math.floor(rng.next() * arr.length)] as T;
}

async function decide(
  state: GameState,
  seat: Seat,
  rng: RNG,
): Promise<Action> {
  const choices = legalActions(state, seat);
  if (choices.length === 0) {
    throw new Error(
      `easyBot.decide: no legal actions for ${seat} in phase ${state.phase}`,
    );
  }

  switch (state.phase) {
    case 'bidding-round-1': {
      const trump = state.turnedCard.suit;
      // Easy never goes alone — filter out alone variants and only consider
      // pass / orderUp(false).
      const passAction = choices.find((a) => a.type === 'pass');
      const orderUp = choices.find(
        (a) => a.type === 'orderUp' && a.alone === false,
      );
      const hand = state.hands[seat];
      if (orderUp !== undefined && easyShouldCall(hand, trump)) {
        return orderUp;
      }
      if (passAction !== undefined) return passAction;
      // No legal pass (impossible in round 1 — pass is always legal); fall
      // back to whatever's available without going alone.
      return orderUp ?? (choices[0] as Action);
    }

    case 'bidding-round-2': {
      const dealerStuck =
        state.variants.stickTheDealer && state.turn === state.dealer;
      const passAction = choices.find((a) => a.type === 'pass');
      const hand = state.hands[seat];
      const rejected = state.rejectedSuit;

      if (!dealerStuck) {
        // Try each non-rejected suit; if Easy "should call" any, do so.
        for (const s of allSuits) {
          if (s === rejected) continue;
          if (easyShouldCall(hand, s)) {
            const call = choices.find(
              (a) =>
                a.type === 'callTrump' && a.suit === s && a.alone === false,
            );
            if (call !== undefined) return call;
          }
        }
        if (passAction !== undefined) return passAction;
      }

      // Stuck — must pick a suit.
      const stuckSuit = bestStuckSuit(hand, rejected, rng);
      const stuckCall = choices.find(
        (a) =>
          a.type === 'callTrump' && a.suit === stuckSuit && a.alone === false,
      );
      if (stuckCall !== undefined) return stuckCall;
      // Fall back to any non-alone callTrump.
      const anyCall = choices.find(
        (a) => a.type === 'callTrump' && a.alone === false,
      );
      if (anyCall !== undefined) return anyCall;
      return choices[0] as Action;
    }

    case 'dealer-discard': {
      // Discard the weakest card under trump (treat led=trump for ranking
      // — that's the same as ranking on overall card power: anything that
      // isn't trump scores below trump, and trump cards rank within trump).
      // We pass `trump` as `led` so non-trump cards are ranked among
      // themselves by their own native strength when one is the strongest.
      // This is a coarse approximation; Medium does it more carefully.
      const hand = state.hands[seat];
      const weakest = pickWeakest(hand, state.trump, state.trump);
      const discard = choices.find(
        (a) =>
          a.type === 'discardKitty' &&
          a.card.suit === weakest.suit &&
          a.card.rank === weakest.rank,
      );
      if (discard !== undefined) return discard;
      return choices[0] as Action;
    }

    case 'playing': {
      // Random legal card.
      return pickRandom(choices, rng);
    }

    case 'dealing':
    case 'hand-complete':
    case 'game-complete':
      // No legal actions in these phases (legalActions returns []).
      // The early-return above caught choices.length===0; we shouldn't
      // reach this branch.
      throw new Error(
        `easyBot.decide: unexpected phase ${state.phase} with non-empty legalActions`,
      );
  }
}

/** Factory for the Easy bot. */
export function easyBot(name = 'Easy'): Bot {
  return {
    name,
    difficulty: 'easy',
    decide,
  };
}
