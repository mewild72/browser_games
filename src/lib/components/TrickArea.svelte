<script lang="ts">
  /**
   * The cards currently played in the in-progress trick, labelled by
   * which seat played them. Also displays a prominent trump indicator
   * during the `playing` phase so the human can see trump without
   * looking away from the centre of the board.
   *
   * Trick rendering precedence:
   *   1. `displayedTrick.value` (from the state module) — if non-null,
   *      a trick was just completed and we're in the post-trick pause
   *      window: render those four cards so the human sees the final
   *      card before the table clears.
   *   2. `plays` prop — the in-progress current trick.
   *
   * The trump-indicator size shrinks while a trick is in progress so
   * the cards stay the centre of attention.
   *
   * Owner: svelte-component-architect
   */
  import type { Suit, TrickPlay } from '@/lib/types';
  import { displayedTrick } from '@/lib/game/state.svelte';
  import CardView from './Card.svelte';
  import TrumpIndicator from './TrumpIndicator.svelte';

  type Props = {
    plays: readonly TrickPlay[];
    /**
     * Trump suit when known (`playing` phase). Undefined during
     * non-playing phases — the indicator hides itself in that case.
     */
    trump?: Suit | undefined;
  };

  let { plays, trump }: Props = $props();

  /**
   * Cards to actually render. While the post-trick pause is active,
   * `displayedTrick.value` carries the just-completed trick's four
   * plays; otherwise we fall back to the prop's in-progress plays.
   */
  const visiblePlays = $derived<readonly TrickPlay[]>(
    displayedTrick.value !== null ? displayedTrick.value.plays : plays,
  );
  const isFrozen = $derived(displayedTrick.value !== null);
  /**
   * Trump indicator size: shrinks while cards are in the centre so
   * they're not visually crowded.
   */
  const indicatorSize = $derived<'large' | 'small'>(
    visiblePlays.length === 0 ? 'large' : 'small',
  );
</script>

<section class="trick" aria-labelledby="trick-heading">
  <h3 id="trick-heading" class="sr-only">
    {visiblePlays.length === 0
      ? 'Current trick, no cards played yet'
      : isFrozen
        ? `Trick complete, ${visiblePlays.length} cards played`
        : `Current trick, ${visiblePlays.length} ${visiblePlays.length === 1 ? 'card' : 'cards'} played`}
  </h3>
  {#if trump !== undefined}
    <div class="trump-slot" class:corner={visiblePlays.length > 0}>
      <TrumpIndicator suit={trump} size={indicatorSize} />
    </div>
  {/if}
  {#if visiblePlays.length === 0}
    <p class="empty">No card played yet.</p>
  {:else}
    <ul class="plays" aria-label={`Trick, ${visiblePlays.length} cards played`}>
      {#each visiblePlays as play (play.seat)}
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
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-block-size: 7rem;
    inline-size: 100%;
  }
  /* Trump banner — large, centred when no cards are on the table; it
     drops to a corner and shrinks when a trick is in progress so the
     cards keep the spotlight. */
  .trump-slot {
    display: flex;
    justify-content: center;
  }
  .trump-slot.corner {
    position: absolute;
    inset-block-start: var(--space-2);
    inset-inline-end: var(--space-2);
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
