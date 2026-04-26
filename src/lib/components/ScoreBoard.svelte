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

<section class="scoreboard" aria-labelledby="scoreboard-heading">
  <h3 id="scoreboard-heading" class="sr-only">Score</h3>
  <!--
    Definition list is the right semantic for label/value pairs. Screen readers
    announce them as "NS, term … 0, definition." A real <table> would be heavy
    for what is fundamentally key/value data, not tabular rows × columns.
  -->
  <dl class="cells">
    <div class="cell">
      <dt class="label">NS</dt>
      <dd class="value">{state.score.ns}</dd>
    </div>
    <div class="cell">
      <dt class="label">EW</dt>
      <dd class="value">{state.score.ew}</dd>
    </div>
    <div class="cell wide">
      <dt class="label">Phase</dt>
      <dd class="value">{state.phase}</dd>
    </div>
    <div class="cell wide">
      <dt class="label">Dealer</dt>
      <dd class="value">{state.dealer}</dd>
    </div>
    <div class="cell wide">
      <dt class="label">Trump</dt>
      <dd class="value">{trumpLabel}</dd>
    </div>
    <div class="cell wide">
      <dt class="label">Maker</dt>
      <dd class="value">{makerLabel}</dd>
    </div>
    <div class="cell wider">
      <dt class="label">Tricks</dt>
      <dd class="value">{tricksLabel}</dd>
    </div>
    <div class="cell wide">
      <dt class="label">To win</dt>
      <dd class="value">{state.variants.pointsToWin}</dd>
    </div>
  </dl>
</section>

<style>
  .scoreboard {
    padding: var(--space-3) var(--space-4);
    background-color: var(--bg-surface-strong);
    border-radius: var(--radius-lg);
    color: var(--text-on-felt);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-panel);
  }
  .cells {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-5);
    align-items: stretch;
    margin: 0;
    padding: 0;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-inline-size: 3rem;
  }
  dt,
  dd {
    margin: 0;
  }
  .cell.wide {
    min-inline-size: 5rem;
  }
  .cell.wider {
    min-inline-size: 12rem;
  }
  .label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 600;
  }
  .value {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-on-felt);
    text-transform: capitalize;
  }
</style>
