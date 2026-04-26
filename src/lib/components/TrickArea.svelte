<script lang="ts">
  /**
   * The cards currently played in the in-progress trick, labelled by
   * which seat played them. Empty when no card has been led yet.
   *
   * Owner: svelte-component-architect
   */
  import type { TrickPlay } from '@/lib/types';
  import CardView from './Card.svelte';

  type Props = {
    plays: readonly TrickPlay[];
  };

  let { plays }: Props = $props();
</script>

<div class="trick" aria-label="Current trick">
  {#if plays.length === 0}
    <span class="empty">No card played yet.</span>
  {:else}
    <ul class="plays">
      {#each plays as play (play.seat)}
        <li>
          <span class="seat">{play.seat}</span>
          <CardView card={play.card} />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .trick {
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 5rem;
  }
  .plays {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: var(--space-3, 1rem);
  }
  .plays li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: var(--text-primary);
  }
  .seat {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .empty {
    color: var(--text-muted);
  }
</style>
