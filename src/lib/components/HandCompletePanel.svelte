<script lang="ts">
  /**
   * Hand-complete panel. Shows the result and a button to advance.
   *
   * Owner: svelte-component-architect
   */
  import type { HandCompleteState } from '@/lib/types';

  type Props = {
    state: HandCompleteState;
    onNext: () => void;
  };

  let { state, onNext }: Props = $props();
</script>

<section class="hand-complete" aria-labelledby="hand-complete-heading">
  <h3 id="hand-complete-heading">Hand complete</h3>
  <dl class="result">
    <div class="row">
      <dt>Trump</dt>
      <dd>{state.result.trump}</dd>
    </div>
    <div class="row">
      <dt>Maker</dt>
      <dd>{state.result.maker.toUpperCase()}{state.result.alone ? ' (alone)' : ''}</dd>
    </div>
    <div class="row">
      <dt>Tricks won</dt>
      <dd>makers {state.result.tricksWon.makers} / defenders {state.result.tricksWon.defenders}</dd>
    </div>
    <div class="row">
      <dt>Points awarded</dt>
      <dd>NS {state.result.pointsAwarded.ns}, EW {state.result.pointsAwarded.ew}</dd>
    </div>
    {#if state.result.euchred}
      <div class="row">
        <dt>Outcome</dt>
        <dd>Makers were euchred.</dd>
      </div>
    {/if}
  </dl>
  <button type="button" class="btn btn-primary next-btn" onclick={onNext}>Next hand</button>
</section>

<style>
  .hand-complete {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background-color: var(--bg-surface-strong);
    border-radius: var(--radius-lg);
    color: var(--text-on-felt);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-panel);
    animation: panel-appear var(--duration-normal) var(--easing-emphasized);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }
  .result {
    margin: 0;
    display: grid;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
  }
  dt {
    margin: 0;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: var(--font-size-xs);
    min-inline-size: 10rem;
    align-self: center;
  }
  dd {
    margin: 0;
    color: var(--text-on-felt);
  }
  .next-btn {
    align-self: flex-start;
    margin-block-start: var(--space-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-complete {
      animation: none;
    }
  }
</style>
