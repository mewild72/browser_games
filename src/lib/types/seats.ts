/**
 * Seat and partnership primitives.
 *
 * Four seats around a table; two partnerships sitting opposite. North-South
 * always partners; East-West always partners. The human player is `south`
 * by convention (UI puts the human at the bottom of the table).
 *
 * Owner: typescript-architect
 */

/** The four seats at the table, named by compass direction. */
export type Seat = 'north' | 'east' | 'south' | 'west';

/**
 * Partnership identifiers.
 *
 * - `ns` = North + South
 * - `ew` = East + West
 */
export type Partnership = 'ns' | 'ew';

/** Compile-time list of seats in turn-order rotation (clockwise from north). */
export const seatsClockwise: readonly Seat[] = [
  'north',
  'east',
  'south',
  'west',
] as const;

/** Lookup from seat to its partnership. */
export const partnershipOfSeat: Readonly<Record<Seat, Partnership>> = {
  north: 'ns',
  south: 'ns',
  east: 'ew',
  west: 'ew',
} as const;

/** Lookup from seat to its partner's seat. */
export const partnerOfSeat: Readonly<Record<Seat, Seat>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
} as const;

/** Lookup from seat to the seat to its left (next in clockwise rotation). */
export const leftOfSeat: Readonly<Record<Seat, Seat>> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
} as const;
