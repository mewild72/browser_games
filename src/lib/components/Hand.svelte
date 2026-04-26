<script lang="ts">
  /**
   * A player's hand. Shows up to 5 cards.
   *
   * For the human seat, supplies onclick handlers for cards in `playable`.
   * For other seats (or when not the human's turn), all cards render dimmed
   * and non-interactive.
   *
   * Keyboard model (accessibility-expert):
   *   - Left / Right arrow keys move focus between cards. Movement skips
   *     non-focusable (face-down or non-playable) entries; if every card
   *     is non-interactive, the keys do nothing.
   *   - Home / End jump to the first / last focusable card.
   *   - Enter / Space activate the focused card via the underlying button.
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

  let listEl: HTMLUListElement | undefined = $state();

  /**
   * Find every card-button within the hand, in DOM order. The card
   * buttons are the only focusable descendants when this hand belongs to
   * the human; for other seats the array is empty (face-down cards are
   * spans, not buttons).
   */
  function focusableCards(): HTMLButtonElement[] {
    if (listEl === undefined) return [];
    return Array.from(listEl.querySelectorAll<HTMLButtonElement>('button.card.playable'));
  }

  function onListKeydown(e: KeyboardEvent): void {
    if (faceDown) return;
    const buttons = focusableCards();
    if (buttons.length === 0) return;
    const active = document.activeElement;
    const currentIndex = buttons.findIndex((b) => b === active);
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
      buttons[next]!.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = currentIndex < 0 || currentIndex === buttons.length - 1 ? 0 : currentIndex + 1;
      buttons[next]!.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]!.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]!.focus();
    }
  }
</script>

<!--
  The keydown handler captures arrow / Home / End navigation between the
  card buttons that live inside this list. The handler does nothing
  unless a card-button descendant has focus (the listener is a passive
  router that delegates to the focused button), so the static-element
  interaction warning does not apply in practice.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul
  class="hand"
  aria-label={ariaLabel}
  bind:this={listEl}
  onkeydown={onListKeydown}
>
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
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    /* Slight downward overlap among adjacent cards for a held-hand feel. */
  }
  .hand li {
    display: inline-flex;
  }
</style>
