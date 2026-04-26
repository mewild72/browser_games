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

<div class="kitty" aria-label="Kitty">
  <div class="stack" aria-label="Kitty stack">
    {#each kitty as _card, i (i)}
      <CardView card={undefined} faceDown ariaLabel="Face-down kitty card" />
    {/each}
    {#if kitty.length === 0}
      <span class="empty">(empty)</span>
    {/if}
  </div>
  <div class="turned">
    {#if turnedCard !== undefined}
      <CardView
        card={turnedCard}
        faceDown={turnedFaceDown}
        ariaLabel={turnedFaceDown ? 'Turned card, face down' : `Turned card: ${turnedCard.rank} of ${turnedCard.suit}`}
      />
    {/if}
  </div>
</div>

<style>
  .kitty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 0.5rem);
  }
  .stack {
    display: flex;
    gap: 2px;
  }
  .empty {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
