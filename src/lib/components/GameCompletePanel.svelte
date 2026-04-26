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

<section class="game-complete" aria-label="Game complete">
  <h2>{youWon ? 'You won!' : 'You lost.'}</h2>
  <p>Final score: NS {state.score.ns} – EW {state.score.ew}</p>
  <button type="button" onclick={onNewGame}>New game</button>
</section>

<style>
  .game-complete {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
    padding: var(--space-3, 1rem);
    background-color: hsla(0, 0%, 0%, 0.4);
    border-radius: var(--radius-card, 0.5rem);
    color: var(--text-primary);
    align-items: center;
    text-align: center;
  }
  h2 {
    margin: 0;
  }
  button {
    padding: 0.6rem 1.2rem;
    border-radius: 0.4rem;
    border: none;
    background-color: var(--accent);
    color: hsl(0, 0%, 12%);
    cursor: pointer;
    font-weight: 600;
  }
</style>
