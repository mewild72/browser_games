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
  import type { Card, CompletedTrick, Seat } from '@/lib/types';
  import { displayedTrick } from '@/lib/game/state.svelte';
  import CardView from './Card.svelte';
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

  /**
   * The just-completed trick to render *at this seat* — non-null only
   * when the post-trick pause is active AND this seat is the trick's
   * winner. Each `<PlayerSeat>` evaluates this independently so exactly
   * one of the four seats renders the overlay per pause.
   *
   * The trick may carry 3 or 4 plays — a lone-hand trick has only 3
   * (the lone caller's partner sits out). The overlay renders whatever
   * count is on the trick rather than hardcoding four.
   */
  const wonTrick = $derived<CompletedTrick | null>(
    displayedTrick.value !== null && displayedTrick.value.winner === seat
      ? displayedTrick.value
      : null,
  );
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
  {#if wonTrick !== null}
    <!--
      Just-won trick rendered next to the seat that won it. The four (or
      three, for a lone hand) cards from the trick are arrayed in a small
      cluster so the human can see whose play won where. Only one
      `<PlayerSeat>` ever renders this at a time because each seat
      evaluates `displayedTrick.value.winner === seat` independently.

      `aria-hidden` is set because trick winners are already announced via
      the action log's live region; the overlay is purely visual.
    -->
    <div class="won-trick" aria-hidden="true">
      <ul class="won-trick-cards">
        {#each wonTrick.plays as play (play.seat)}
          <li class="won-trick-card" data-seat={play.seat}>
            <CardView card={play.card} />
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .seat {
    position: relative;
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
  /*
    The won-trick overlay clusters the just-completed plays near the
    winning seat. Cards are rendered at a slightly reduced size and
    arrayed in a 2x2-ish flex grid so 3-card (lone hand) and 4-card
    tricks both look balanced. The cluster sits inside the seat's box
    underneath the hand so it visually "lands" on top of the winner.
  */
  .won-trick {
    display: flex;
    justify-content: center;
    margin-block-start: var(--space-1);
    animation: won-trick-in var(--duration-normal) var(--easing-standard);
  }
  .won-trick-cards {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: var(--space-1);
    border-radius: var(--radius-md);
    background-color: hsla(140, 30%, 12%, 0.65);
    box-shadow:
      0 4px 14px hsla(0, 0%, 0%, 0.35),
      0 0 0 1px var(--accent);
  }
  .won-trick-card {
    /*
      Scale the cards down so the overlay doesn't crowd the seat. The
      Card component sets its own dimensions, so we transform the
      wrapping <li> rather than the card element itself.
    */
    transform: scale(0.7);
    transform-origin: center;
    margin: calc(var(--space-2) * -1);
  }
  @keyframes won-trick-in {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.92);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .won-trick {
      animation: none;
    }
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
