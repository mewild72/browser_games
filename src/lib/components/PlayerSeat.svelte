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

<section
  class="seat"
  class:active={isActive}
  class:sitting-out={isSittingOut}
  aria-labelledby={`seat-heading-${seat}`}
  aria-current={isActive ? 'true' : undefined}
>
  <header class="hdr">
    <h3 id={`seat-heading-${seat}`} class="name">
      {seat}{isHuman ? ' (you)' : ''}
    </h3>
    <span class="badges">
      {#if isDealer}
        <!-- Compact glyph for sighted users; sr-only word for AT. ARIA prohibits
             aria-label on a bare <span> with no role, so we use visually-hidden
             text (axe rule: aria-prohibited-attr). -->
        <span class="badge"><span class="sr-only">Dealer</span><span aria-hidden="true">D</span></span>
      {/if}
      {#if isMaker}
        <span class="badge maker"><span class="sr-only">Maker</span><span aria-hidden="true">M</span></span>
      {/if}
      {#if isActive}
        <span class="badge active"><span class="sr-only">Active turn</span><span aria-hidden="true">▶</span></span>
      {/if}
      {#if isSittingOut}
        <span class="badge muted">sitting out</span>
      {/if}
    </span>
  </header>
  <Hand
    cards={cards}
    faceDown={!isHuman}
    playable={playable}
    onPlay={onPlay}
    ariaLabel={`${seat} hand, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
  />
</section>

<style>
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius-lg);
    background-color: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    transition:
      box-shadow var(--duration-normal) var(--easing-standard),
      border-color var(--duration-normal) var(--easing-standard),
      opacity var(--duration-fast) var(--easing-standard);
  }
  .seat.active {
    border-color: var(--accent);
    box-shadow:
      0 0 0 1px var(--accent),
      0 0 22px hsla(45, 90%, 55%, 0.35);
    background-color: hsla(45, 30%, 14%, 0.55);
  }
  .seat.sitting-out {
    opacity: 0.45;
    filter: saturate(0.5);
  }
  .hdr {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    inline-size: 100%;
  }
  .name {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-on-felt);
  }
  .badges {
    display: inline-flex;
    gap: var(--space-1);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 1.25rem;
    block-size: 1.25rem;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background-color: var(--bg-surface-raised);
    color: var(--text-on-felt);
    font-size: var(--font-size-xs);
    font-weight: 700;
    border: 1px solid var(--border-subtle);
    line-height: 1;
  }
  .badge.maker {
    background-color: var(--accent);
    color: hsl(0, 0%, 12%);
    border-color: var(--accent-strong);
  }
  .badge.active {
    background-color: var(--success);
    color: hsl(0, 0%, 100%);
    border-color: transparent;
  }
  .badge.muted {
    background-color: transparent;
    color: var(--text-muted);
    font-style: italic;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
</style>
