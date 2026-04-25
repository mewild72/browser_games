/**
 * Smoke test for the type layer.
 *
 * Documents the contract of the runtime constants exported from `@/lib/types`.
 * This is intentionally minimal — its primary job is to give Vitest a passing
 * test so CI does not exit 1 with "no tests found". As the rules engine and
 * helpers land, deeper suites will sit alongside this file.
 *
 * Owner: svelte-qa-validator
 */

import { describe, it, expect } from 'vitest';
import {
  defaults,
  partnershipOfSeat,
  colorOfSuit,
  seatsClockwise,
} from '@/lib/types';

describe('@/lib/types defaults', () => {
  it('ships the MVP variant flags from skills/euchre-rules.md', () => {
    expect(defaults.pointsToWin).toBe(10);
    expect(defaults.stickTheDealer).toBe(true);
    expect(defaults.allowGoingAlone).toBe(true);
    expect(defaults.deckSize).toBe(24);
  });
});

describe('@/lib/types partnershipOfSeat', () => {
  it('puts north/south on ns and east/west on ew', () => {
    expect(partnershipOfSeat.north).toBe('ns');
    expect(partnershipOfSeat.south).toBe('ns');
    expect(partnershipOfSeat.east).toBe('ew');
    expect(partnershipOfSeat.west).toBe('ew');
  });
});

describe('@/lib/types colorOfSuit', () => {
  it('classifies hearts/diamonds as red and clubs/spades as black', () => {
    expect(colorOfSuit.hearts).toBe('red');
    expect(colorOfSuit.diamonds).toBe('red');
    expect(colorOfSuit.spades).toBe('black');
    expect(colorOfSuit.clubs).toBe('black');
  });
});

describe('@/lib/types seatsClockwise', () => {
  it('rotates clockwise starting from north', () => {
    expect(seatsClockwise).toEqual(['north', 'east', 'south', 'west']);
  });
});
