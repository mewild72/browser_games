<script lang="ts">
  /**
   * One of the four seats. Wraps a `<Hand>` and labels it with the seat
   * name plus a "your turn" indicator when it's the active turn.
   *
   * For the south seat (human), cards face up and the parent supplies
   * `playable` + `onPlay`. For other seats the cards are face down.
   *
   * Owner: svelte-component-architect
   */
  import type { Card, Seat } from '@/lib/types';
  import Hand from './Hand.svelte';

  type Props = {
    seat: Seat;
    cards: readonly Card[];
    isHuman?: boolean;
    isActive?: boolean;
    isDealer?: boolean;
    isMaker?: boolean;
    isSittingOut?: boolean;
    /** Cards from `cards` that the player may play right now (human only). */
    playable?: readonly Card[];
    onPlay?: ((card: Card) => void) | undefined;
  };

  let {
    seat,
    cards,
    isHuman = false,
    isActive = false,
    isDealer = false,
    isMaker = false,
    isSittingOut = false,
    playable = [],
    onPlay,
  }: Props = $props();
</script>

<section class="seat" class:active={isActive} class:sitting-out={isSittingOut} aria-label={`${seat} seat`}>
  <header class="hdr">
    <span class="name">{seat}{isHuman ? ' (you)' : ''}</span>
    <span class="badges">
      {#if isDealer}<span class="badge">D</span>{/if}
      {#if isMaker}<span class="badge maker">M</span>{/if}
      {#if isActive}<span class="badge active" aria-label="Active turn">▶</span>{/if}
      {#if isSittingOut}<span class="badge muted">sitting out</span>{/if}
    </span>
  </header>
  <Hand
    cards={cards}
    faceDown={!isHuman}
    playable={playable}
    onPlay={onPlay}
    ariaLabel={`${seat} hand`}
  />
</section>

<style>
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1, 0.25rem);
    padding: var(--space-2, 0.5rem);
    border-radius: var(--radius-card, 0.5rem);
    background-color: hsla(0, 0%, 0%, 0.15);
  }
  .seat.active {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .seat.sitting-out {
    opacity: 0.55;
  }
  .hdr {
    display: flex;
    gap: var(--space-2, 0.5rem);
    align-items: center;
  }
  .name {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: capitalize;
    color: var(--text-primary);
  }
  .badges {
    display: inline-flex;
    gap: 4px;
  }
  .badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    background-color: hsla(0, 0%, 100%, 0.2);
    color: var(--text-primary);
  }
  .badge.maker {
    background-color: var(--accent);
    color: hsl(0, 0%, 12%);
  }
  .badge.active {
    background-color: var(--toggle-on);
  }
  .badge.muted {
    background-color: transparent;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
