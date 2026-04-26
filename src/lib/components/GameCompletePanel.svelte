<script lang="ts">
  /**
   * Game-complete panel.
   *
   * Owner: svelte-component-architect
   */
  import type { GameCompleteState } from '@/lib/types';

  type Props = {
    state: GameCompleteState;
    onNewGame: () => void;
  };

  let { state, onNewGame }: Props = $props();

  const youWon = $derived(state.winner === 'ns');
</script>

<section class="game-complete" aria-labelledby="game-complete-heading">
  <h3 id="game-complete-heading">{youWon ? 'You won!' : 'You lost.'}</h3>
  <p>Final score: NS {state.score.ns} – EW {state.score.ew}</p>
  <button type="button" class="btn btn-primary" onclick={onNewGame}>New game</button>
</section>

<style>
  .game-complete {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    background-color: var(--bg-surface-strong);
    border-radius: var(--radius-lg);
    color: var(--text-on-felt);
    border: 1px solid var(--accent);
    box-shadow:
      var(--shadow-panel),
      0 0 30px hsla(45, 90%, 55%, 0.18);
    align-items: center;
    text-align: center;
    animation: panel-appear var(--duration-normal) var(--easing-emphasized);
  }
  h3 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  p {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text-on-felt);
  }

  @media (prefers-reduced-motion: reduce) {
    .game-complete {
      animation: none;
    }
  }
</style>
