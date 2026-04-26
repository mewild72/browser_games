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

<section class="hand-complete" aria-label="Hand complete">
  <h3>Hand complete</h3>
  <ul>
    <li>Trump: {state.result.trump}</li>
    <li>Maker: {state.result.maker.toUpperCase()}{state.result.alone ? ' (alone)' : ''}</li>
    <li>Tricks won: makers {state.result.tricksWon.makers} / defenders {state.result.tricksWon.defenders}</li>
    <li>Points awarded: NS {state.result.pointsAwarded.ns}, EW {state.result.pointsAwarded.ew}</li>
    {#if state.result.euchred}<li>Makers were euchred.</li>{/if}
  </ul>
  <button type="button" onclick={onNext}>Next hand</button>
</section>

<style>
  .hand-complete {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-3, 1rem);
    background-color: hsla(0, 0%, 0%, 0.25);
    border-radius: var(--radius-card, 0.5rem);
    color: var(--text-primary);
  }
  h3 {
    margin: 0;
  }
  ul {
    list-style: disc;
    padding-inline-start: var(--space-3, 1rem);
    margin: 0;
  }
  button {
    align-self: flex-start;
    padding: 0.5rem 1rem;
    border-radius: 0.4rem;
    border: none;
    background-color: var(--accent);
    color: hsl(0, 0%, 12%);
    cursor: pointer;
    font-weight: 600;
  }
</style>
