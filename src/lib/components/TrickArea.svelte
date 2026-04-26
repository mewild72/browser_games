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

<section class="trick" aria-labelledby="trick-heading">
  <h3 id="trick-heading" class="sr-only">
    {plays.length === 0
      ? 'Current trick, no cards played yet'
      : `Current trick, ${plays.length} ${plays.length === 1 ? 'card' : 'cards'} played`}
  </h3>
  {#if plays.length === 0}
    <p class="empty">No card played yet.</p>
  {:else}
    <ul class="plays" aria-label={`Trick in progress, ${plays.length} cards played`}>
      {#each plays as play (play.seat)}
        <li>
          <span class="seat">{play.seat}</span>
          <CardView card={play.card} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .trick {
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 7rem;
    inline-size: 100%;
  }
  .plays {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: var(--space-5);
    flex-wrap: wrap;
    justify-content: center;
  }
  .plays li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-on-felt);
    animation: play-card var(--duration-deal) var(--easing-emphasized);
  }
  .seat {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: var(--text-muted);
  }
  .empty {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    .plays li {
      animation: none;
    }
  }
</style>
