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
    <p role="status" aria-live="polite">Loading…</p>
  {:else if stats.hands === 0}
    <p>No games played yet. Finish a hand to see stats.</p>
  {:else}
    <table class="stat-table">
      <caption>Win rate by difficulty</caption>
      <thead>
        <tr>
          <th scope="col">Difficulty</th>
          <th scope="col" class="num">Win rate</th>
        </tr>
      </thead>
      <tbody>
        <tr><th scope="row">Easy</th><td class="num">{pct(stats.easy)}</td></tr>
        <tr><th scope="row">Medium</th><td class="num">{pct(stats.medium)}</td></tr>
        <tr><th scope="row">Hard</th><td class="num">{pct(stats.hard)}</td></tr>
      </tbody>
    </table>

    <dl class="summary">
      <div class="row">
        <dt>Hands played</dt>
        <dd>{stats.hands}</dd>
      </div>
      <div class="row">
        <dt>Euchred as makers</dt>
        <dd>{pct(stats.euchre.asMakers)}</dd>
      </div>
      <div class="row">
        <dt>Defended a euchre</dt>
        <dd>{pct(stats.euchre.asDefenders)}</dd>
      </div>
      <div class="row">
        <dt>Going-alone call rate</dt>
        <dd>{pct(stats.alone.callRate)}</dd>
      </div>
      <div class="row">
        <dt>Going-alone success rate</dt>
        <dd>{pct(stats.alone.successRate)}</dd>
      </div>
    </dl>

    <table class="stat-table trump-table">
      <caption>Trump suit distribution</caption>
      <thead>
        <tr>
          <th scope="col">Suit</th>
          <th scope="col" class="num">Count</th>
        </tr>
      </thead>
      <tbody>
        <tr><th scope="row"><span class="suit-glyph black" aria-hidden="true">&#9827;</span> Clubs</th><td class="num">{stats.trump.clubs}</td></tr>
        <tr><th scope="row"><span class="suit-glyph red" aria-hidden="true">&#9830;</span> Diamonds</th><td class="num">{stats.trump.diamonds}</td></tr>
        <tr><th scope="row"><span class="suit-glyph red" aria-hidden="true">&#9829;</span> Hearts</th><td class="num">{stats.trump.hearts}</td></tr>
        <tr><th scope="row"><span class="suit-glyph black" aria-hidden="true">&#9824;</span> Spades</th><td class="num">{stats.trump.spades}</td></tr>
      </tbody>
    </table>

    <table class="stat-table">
      <caption>Scoring distribution (per hand)</caption>
      <thead>
        <tr>
          <th scope="col">Points</th>
          <th scope="col" class="num">Count</th>
        </tr>
      </thead>
      <tbody>
        <tr><th scope="row">0 (euchred)</th><td class="num">{stats.scoring['0']}</td></tr>
        <tr><th scope="row">1</th><td class="num">{stats.scoring['1']}</td></tr>
        <tr><th scope="row">2</th><td class="num">{stats.scoring['2']}</td></tr>
        <tr><th scope="row">4</th><td class="num">{stats.scoring['4']}</td></tr>
      </tbody>
    </table>

    <h3>Recent games</h3>
    {#if stats.recent.length === 0}
      <p>(none)</p>
    {:else}
      <table class="stat-table">
        <caption class="sr-only">Recent games</caption>
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">Difficulty</th>
            <th scope="col">Winner</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.recent as g (g.id)}
            <tr>
              <td>{new Date(g.startedAt).toLocaleString()}</td>
              <td>{g.difficulty}</td>
              <td>{g.winner ?? 'in progress'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</Modal>

<style>
  h3 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }
  .stat-table {
    inline-size: 100%;
    border-collapse: collapse;
  }
  .stat-table caption {
    text-align: start;
    margin-block-end: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }
  .stat-table th,
  .stat-table td {
    text-align: start;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border-subtle);
  }
  .stat-table th[scope="col"] {
    color: var(--text-muted);
    font-weight: 700;
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  /* Right-align numeric columns. */
  .stat-table .num {
    text-align: end;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  /* Zebra striping for readability on long tables. */
  .stat-table tbody tr:nth-child(odd) {
    background-color: hsla(0, 0%, 0%, 0.15);
  }

  /* Trump distribution: show suit color via the inline glyph. */
  .trump-table .suit-glyph {
    display: inline-block;
    inline-size: 1.2em;
    text-align: center;
    margin-inline-end: var(--space-1);
  }
  .trump-table .suit-glyph.red {
    color: var(--suit-red);
  }
  .trump-table .suit-glyph.black {
    color: var(--text-primary);
  }

  .summary {
    display: grid;
    gap: var(--space-2);
    margin: 0;
  }
  .summary .row {
    display: flex;
    gap: var(--space-3);
    padding-block: var(--space-1);
    border-block-end: 1px solid var(--border-subtle);
  }
  .summary .row:last-child {
    border-block-end: none;
  }
  .summary dt {
    margin: 0;
    color: var(--text-muted);
    min-inline-size: 14rem;
    font-size: var(--font-size-sm);
  }
  .summary dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
