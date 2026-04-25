/**
 * Public AI barrel.
 *
 * Consumers (Svelte game loop, tests) import from `@/lib/ai`.
 *
 * Owner: ai-strategy-expert
 */

export type { Bot, Difficulty } from './types';
export { easyBot } from './easy';
export { mediumBot } from './medium';
export { hardBot } from './hard';
export { runTournament, tournamentWithSeed } from './tournament';
export type { TournamentOpts, TournamentResult } from './tournament';
