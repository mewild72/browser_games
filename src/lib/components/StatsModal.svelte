<script lang="ts">
  /**
   * Stats modal. Pulls aggregate metrics from the storage layer.
   *
   * Owner: svelte-component-architect
   */
  import Modal from './Modal.svelte';
  import {
    euchreRate,
    goingAloneStats,
    handsPlayed,
    recentGames,
    scoringDistribution,
    trumpDistribution,
    winRateByDifficulty,
  } from '@/lib/storage';
  import type { GameRecord } from '@/lib/storage';
  import type { Suit } from '@/lib/types';

  type Props = {
    open: boolean;
    onclose: () => void;
  };

  let { open, onclose }: Props = $props();

  let stats = $state<{
    easy: number;
    medium: number;
    hard: number;
    euchre: { asMakers: number; asDefenders: number };
    trump: Record<Suit, number>;
    alone: { callRate: number; successRate: number };
    hands: number;
    recent: readonly GameRecord[];
    scoring: { '0': number; '1': number; '2': number; '4': number };
    loading: boolean;
  }>({
    easy: 0,
    medium: 0,
    hard: 0,
    euchre: { asMakers: 0, asDefenders: 0 },
    trump: { clubs: 0, diamonds: 0, hearts: 0, spades: 0 },
    alone: { callRate: 0, successRate: 0 },
    hands: 0,
    recent: [],
    scoring: { '0': 0, '1': 0, '2': 0, '4': 0 },
    loading: true,
  });

  $effect(() => {
    if (!open) return;
    void loadStats();
  });

  async function loadStats(): Promise<void> {
    stats.loading = true;
    const [easy, medium, hard, eu, td, al, hp, rg, sd] = await Promise.all([
      winRateByDifficulty('easy'),
      winRateByDifficulty('medium'),
      winRateByDifficulty('hard'),
      euchreRate(),
      trumpDistribution(),
      goingAloneStats(),
      handsPlayed(),
      recentGames(10),
      scoringDistribution(),
    ]);
    stats.easy = easy;
    stats.medium = medium;
    stats.hard = hard;
    stats.euchre = { ...eu };
    stats.trump = { ...td };
    stats.alone = { ...al };
    stats.hands = hp;
    stats.recent = rg;
    stats.scoring = { ...sd };
    stats.loading = false;
  }

  function pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }
</script>

<Modal {open} {onclose} title="Stats">
  {#if stats.loading}
    <p>Loading…</p>
  {:else if stats.hands === 0}
    <p>No games played yet. Finish a hand to see stats.</p>
  {:else}
    <h3>Win rate</h3>
    <ul>
      <li>Easy: {pct(stats.easy)}</li>
      <li>Medium: {pct(stats.medium)}</li>
      <li>Hard: {pct(stats.hard)}</li>
    </ul>

    <h3>Hands played</h3>
    <p>{stats.hands}</p>

    <h3>Euchre rate</h3>
    <ul>
      <li>You euchred (as makers): {pct(stats.euchre.asMakers)}</li>
      <li>You defended a euchre: {pct(stats.euchre.asDefenders)}</li>
    </ul>

    <h3>Trump distribution</h3>
    <ul>
      <li>Clubs: {stats.trump.clubs}</li>
      <li>Diamonds: {stats.trump.diamonds}</li>
      <li>Hearts: {stats.trump.hearts}</li>
      <li>Spades: {stats.trump.spades}</li>
    </ul>

    <h3>Going alone</h3>
    <ul>
      <li>Call rate: {pct(stats.alone.callRate)}</li>
      <li>Success rate: {pct(stats.alone.successRate)}</li>
    </ul>

    <h3>Scoring distribution (per hand)</h3>
    <ul>
      <li>0 (euchred): {stats.scoring['0']}</li>
      <li>1 point: {stats.scoring['1']}</li>
      <li>2 points: {stats.scoring['2']}</li>
      <li>4 points: {stats.scoring['4']}</li>
    </ul>

    <h3>Recent games</h3>
    {#if stats.recent.length === 0}
      <p>(none)</p>
    {:else}
      <ol>
        {#each stats.recent as g (g.id)}
          <li>
            {new Date(g.startedAt).toLocaleString()} — {g.difficulty}, winner: {g.winner ?? 'in progress'}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</Modal>

<style>
  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  ul,
  ol {
    margin: 0;
    padding-inline-start: var(--space-3, 1rem);
  }
</style>
