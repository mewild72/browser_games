<script lang="ts">
  /**
   * A player's hand. Shows up to 5 cards.
   *
   * For the human seat, supplies onclick handlers for cards in `playable`.
   * For other seats (or when not the human's turn), all cards render dimmed
   * and non-interactive.
   *
   * Owner: svelte-component-architect
   */
  import type { Card } from '@/lib/types';
  import CardView from './Card.svelte';

  type Props = {
    cards: readonly Card[];
    faceDown?: boolean;
    /** Cards from `cards` that the player may currently click. Empty array → none. */
    playable?: readonly Card[];
    onPlay?: ((card: Card) => void) | undefined;
    /** Optional aria-labelled-by id for the surrounding region. */
    ariaLabel?: string;
  };

  let {
    cards,
    faceDown = false,
    playable = [],
    onPlay,
    ariaLabel = 'Hand',
  }: Props = $props();

  function isPlayable(card: Card): boolean {
    return playable.some(
      (p) => p.suit === card.suit && p.rank === card.rank && p.deckId === card.deckId,
    );
  }
</script>

<ul class="hand" aria-label={ariaLabel}>
  {#each cards as card (`${card.suit}-${card.rank}-${card.deckId ?? 0}`)}
    <li>
      {#if !faceDown && onPlay !== undefined && isPlayable(card)}
        <CardView {card} onclick={() => onPlay(card)} />
      {:else}
        <CardView
          {card}
          {faceDown}
          dimmed={!faceDown && playable.length > 0 && !isPlayable(card)}
        />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .hand {
    list-style: none;
    margin: 0;
    padding: 0;
    display: inline-flex;
    gap: var(--space-1, 0.25rem);
    align-items: center;
  }
  .hand li {
    display: inline-flex;
  }
</style>
