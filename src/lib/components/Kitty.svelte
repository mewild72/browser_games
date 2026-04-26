<script lang="ts">
  /**
   * Kitty + turned card display.
   *
   * In bidding round 1 the turned card is face up. In round 2 it's face
   * down (the engine sets `phase: 'bidding-round-2'`). Once trump is
   * fixed, the kitty is no longer drawn (caller hides this component).
   *
   * Owner: svelte-component-architect
   */
  import type { Card } from '@/lib/types';
  import CardView from './Card.svelte';

  type Props = {
    turnedCard: Card | undefined;
    kitty: readonly Card[];
    /** True if the turned card should render face down (round 2). */
    turnedFaceDown?: boolean;
  };

  let { turnedCard, kitty, turnedFaceDown = false }: Props = $props();
</script>

<section class="kitty" aria-labelledby="kitty-heading">
  <h3 id="kitty-heading" class="sr-only">
    Kitty, {kitty.length} {kitty.length === 1 ? 'card' : 'cards'}
  </h3>
  {#if kitty.length === 0}
    <p class="empty">(empty)</p>
  {:else}
    <ul class="stack" aria-label={`Kitty stack, ${kitty.length} cards`}>
      {#each kitty as _card, i (i)}
        <li>
          <CardView card={undefined} faceDown ariaLabel="Face-down kitty card" />
        </li>
      {/each}
    </ul>
  {/if}
  {#if turnedCard !== undefined}
    <div class="turned">
      <CardView
        card={turnedCard}
        faceDown={turnedFaceDown}
        ariaLabel={turnedFaceDown ? 'Turned card, face down' : `Turned card: ${turnedCard.rank} of ${turnedCard.suit}`}
      />
    </div>
  {/if}
</section>

<style>
  .kitty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .stack {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    /* Slight overlap so the kitty looks stacked rather than spread. */
    gap: calc(var(--card-w) * -0.6);
  }
  .stack li {
    display: inline-flex;
  }
  /* Tilt each card a touch differently for that lived-in deck feel. */
  .stack li:nth-child(1) { transform: rotate(-3deg); }
  .stack li:nth-child(2) { transform: rotate(1deg) translateY(-2px); }
  .stack li:nth-child(3) { transform: rotate(-1deg); }
  .stack li:nth-child(4) { transform: rotate(2deg) translateY(-1px); }
  .turned {
    /* The turned card sits proudly next to the stack. */
    margin-block-start: var(--space-2);
  }
  .empty {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-style: italic;
  }
</style>
