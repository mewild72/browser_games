<script lang="ts">
  /**
   * Top-of-table summary: score, current dealer, current trump (if any),
   * tricks won this hand, and phase indicator.
   *
   * Owner: svelte-component-architect
   */
  import type { GameState } from '@/lib/types';

  type Props = {
    state: GameState;
  };

  let { state }: Props = $props();

  const trumpLabel = $derived(extractTrump(state));
  const makerLabel = $derived(extractMaker(state));
  const tricksLabel = $derived(extractTricks(state));

  function extractTrump(s: GameState): string {
    switch (s.phase) {
      case 'dealer-discard':
      case 'playing':
        return s.trump;
      default:
        return '—';
    }
  }

  function extractMaker(s: GameState): string {
    switch (s.phase) {
      case 'dealer-discard':
      case 'playing':
        return `${s.maker.toUpperCase()}${s.alone ? ' (alone)' : ''}`;
      default:
        return '—';
    }
  }

  function extractTricks(s: GameState): string {
    if (s.phase !== 'playing') return '—';
    return `Makers ${s.tricksWon.makers} – Defenders ${s.tricksWon.defenders}`;
  }
</script>

<header class="scoreboard" aria-label="Score board">
  <div class="cell">
    <span class="label">NS</span>
    <span class="value">{state.score.ns}</span>
  </div>
  <div class="cell">
    <span class="label">EW</span>
    <span class="value">{state.score.ew}</span>
  </div>
  <div class="cell wide">
    <span class="label">Phase</span>
    <span class="value">{state.phase}</span>
  </div>
  <div class="cell wide">
    <span class="label">Dealer</span>
    <span class="value">{state.dealer}</span>
  </div>
  <div class="cell wide">
    <span class="label">Trump</span>
    <span class="value">{trumpLabel}</span>
  </div>
  <div class="cell wide">
    <span class="label">Maker</span>
    <span class="value">{makerLabel}</span>
  </div>
  <div class="cell wider">
    <span class="label">Tricks</span>
    <span class="value">{tricksLabel}</span>
  </div>
  <div class="cell wide">
    <span class="label">To win</span>
    <span class="value">{state.variants.pointsToWin}</span>
  </div>
</header>

<style>
  .scoreboard {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3, 1rem);
    align-items: stretch;
    padding: var(--space-2, 0.5rem) var(--space-3, 1rem);
    background-color: hsla(0, 0%, 0%, 0.25);
    border-radius: var(--radius-card, 0.5rem);
    color: var(--text-primary);
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-inline-size: 3rem;
  }
  .cell.wide {
    min-inline-size: 5rem;
  }
  .cell.wider {
    min-inline-size: 12rem;
  }
  .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .value {
    font-size: 1rem;
    font-weight: 600;
  }
</style>
