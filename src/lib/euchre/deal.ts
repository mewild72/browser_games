/**
 * Deal a 24-card euchre hand.
 *
 * Returns hands per seat (5 each), the kitty (4), and the turned-up card
 * (the top of the kitty, face up). All randomness flows through the
 * injected RNG.
 *
 * Owner: game-rules-engine
 */

import type { Card, HandsBySeat, RNG, Seat } from '@/lib/types';
import { seatsClockwise, leftOfSeat } from '@/lib/types';
import { build24CardDeck } from './deck';
import { shuffle } from './shuffle';

/**
 * Deal a single hand. The dealer determines seat ordering: cards go first
 * to the seat to the dealer's left, then around clockwise.
 *
 * 24-card deal: 5 cards per seat (20 total) + 4-card kitty. The first card
 * of the kitty is turned face up as the candidate trump.
 */
export function dealHand(
  rng: RNG,
  dealer: Seat,
): {
  hands: HandsBySeat;
  kitty: readonly Card[];
  turnedCard: Card;
} {
  const shuffled = shuffle(build24CardDeck(), rng);

  // Build seat order starting from the player to the dealer's left.
  const order: Seat[] = [];
  let seat: Seat = leftOfSeat[dealer];
  for (let i = 0; i < seatsClockwise.length; i++) {
    order.push(seat);
    seat = leftOfSeat[seat];
  }

  // Deal 5 cards per seat in a single 5-round pass. The 3-2 / 2-3 cosmetic
  // pattern is not modeled — the rules don't depend on it, and the engine
  // is pure. Cards are taken from the front of the shuffled deck.
  const hands: Record<Seat, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };
  let cursor = 0;
  for (let round = 0; round < 5; round++) {
    for (const s of order) {
      // cursor < 20 always holds; shuffled has 24 entries.
      hands[s].push(shuffled[cursor] as Card);
      cursor++;
    }
  }

  // Kitty: 4 cards (indices 20..23). Top card (turnedCard) is index 20.
  // Remaining 3 are the face-down kitty.
  const turnedCard = shuffled[20] as Card;
  const kitty: readonly Card[] = [
    shuffled[21] as Card,
    shuffled[22] as Card,
    shuffled[23] as Card,
  ];

  return {
    hands: {
      north: hands.north,
      east: hands.east,
      south: hands.south,
      west: hands.west,
    },
    kitty,
    turnedCard,
  };
}
