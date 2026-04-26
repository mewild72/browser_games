<script lang="ts">
  /**
   * The cards currently played in the in-progress trick, arranged
   * around the trump indicator at the cardinal position of the seat
   * that played each card. Also displays a prominent trump indicator
   * during the `playing` phase so the human can see trump without
   * looking away from the centre of the board.
   *
   * Layout: a 3x3 CSS grid with named areas. The trump indicator
   * always occupies the centre cell; played cards land at `north`,
   * `south`, `east`, or `west` depending on which seat played them.
   * Empty cardinal slots simply render no element — the grid keeps the
   * geometry consistent.
   *
   * Trick rendering precedence:
   *   1. `displayedTrick.value` (from the state module) — if non-null,
   *      a trick was just completed and we're in the post-trick pause
   *      window: the cards are surfaced near the winning seat (see
   *      `<PlayerSeat>`), so the centre stays empty (only the trump
   *      indicator remains visible).
   *   2. `plays` prop — the in-progress current trick.
   *
   * The trump-indicator size shrinks while a trick is in progress so
   * the cards stay the centre of attention.
   *
   * Owner: svelte-component-architect
   */
  import type { Seat, Suit, TrickPlay } from '@/lib/types';
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
   * The four cardinal seats, in a stable rendering order. Used to
   * stamp out a blank placeholder card in each empty cardinal slot so
   * the trump always reads visually centred even when fewer than four
   * plays have landed on the table.
   */
  const SEATS: readonly Seat[] = ['north', 'east', 'south', 'west'];

  /**
   * Cards to render in the centre. While the post-trick pause is
   * active, the just-completed trick is rendered NEXT TO THE WINNING
   * SEAT (see `<PlayerSeat>`), and the centre stays empty so the
   * winner-located cluster is the only place that trick appears. Once
   * the pause clears, the centre falls back to rendering the
   * in-progress `plays` prop.
   */
  const visiblePlays = $derived<readonly TrickPlay[]>(
    displayedTrick.value !== null ? [] : plays,
  );
  /**
   * True while the post-trick pause is on. The centre area stays empty
   * during this window — only the trump indicator remains visible — so
   * the won-trick overlay near the winner's seat is unambiguous.
   */
  const isFrozen = $derived(displayedTrick.value !== null);
  /**
   * Trump indicator size: shrinks while cards are in the centre so
   * they're not visually crowded. During the post-trick pause the
   * centre is empty, so we let the indicator stay large for visual
   * continuity through the freeze window.
   */
  const indicatorSize = $derived<'large' | 'small'>(
    visiblePlays.length === 0 ? 'large' : 'small',
  );

  /**
   * Lookup the seat → play mapping for the currently-visible trick.
   * `null` for seats that haven't played yet. During active trick play
   * (trump defined, not frozen) those positions render a blank card
   * placeholder so the trump always reads visually centred. Outside
   * active play (bidding, dealer-discard, hand-complete, frozen pause)
   * the placeholders are suppressed entirely.
   */
  const showPlaceholders = $derived(trump !== undefined && !isFrozen);
  const playBySeat = $derived<Readonly<Record<Seat, TrickPlay | null>>>(
    Object.fromEntries(
      SEATS.map((seat) => [
        seat,
        visiblePlays.find((p) => p.seat === seat) ?? null,
      ]),
    ) as Record<Seat, TrickPlay | null>,
  );
</script>

<section class="trick" aria-labelledby="trick-heading">
  <h3 id="trick-heading" class="sr-only">
    {isFrozen
      ? 'Trick complete; cards moved to winner.'
      : visiblePlays.length === 0
        ? 'Current trick, no cards played yet'
        : `Current trick, ${visiblePlays.length} ${visiblePlays.length === 1 ? 'card' : 'cards'} played`}
  </h3>
  <div
    class="trick-grid"
    role={visiblePlays.length === 0 ? undefined : 'list'}
    aria-label={visiblePlays.length === 0
      ? undefined
      : `Trick, ${visiblePlays.length} cards played`}
  >
    {#if trump !== undefined}
      <div class="trump-slot">
        <TrumpIndicator suit={trump} size={indicatorSize} />
      </div>
    {/if}
    {#if showPlaceholders}
      {#each SEATS as seatSlot (seatSlot)}
        {#if playBySeat[seatSlot] !== null}
          <div class="play" style:grid-area={seatSlot} role="listitem">
            <span class="seat">{seatSlot}</span>
            <CardView card={playBySeat[seatSlot]!.card} />
          </div>
        {:else}
          <!--
            Empty cardinal position. Render a dimmed placeholder so the
            cross stays balanced around the trump and the user can see
            "north hasn't played yet" at a glance. Decorative-only —
            screen readers already get the play count from the heading
            and list label.
          -->
          <div
            class="play-placeholder"
            style:grid-area={seatSlot}
            aria-hidden="true"
          >
            <span class="card-placeholder"></span>
          </div>
        {/if}
      {/each}
    {:else}
      {#each visiblePlays as play (play.seat)}
        <div class="play" style:grid-area={play.seat} role="listitem">
          <span class="seat">{play.seat}</span>
          <CardView card={play.card} />
        </div>
      {/each}
    {/if}
  </div>
  {#if visiblePlays.length === 0 && !isFrozen && trump === undefined}
    <p class="empty">No card played yet.</p>
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
  /*
    3x3 grid with named areas. The trump indicator always sits in the
    centre; played cards align to the cardinal direction of the seat
    that played them. Empty cells render nothing — the grid still
    reserves the geometry so the trump centring is stable.
  */
  .trick-grid {
    display: grid;
    grid-template-areas:
      ".     north  ."
      "west  trump  east"
      ".     south  .";
    gap: var(--space-3);
    place-items: center;
  }
  .trump-slot {
    grid-area: trump;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .play {
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
  /*
    Empty-seat placeholder. Same footprint as a real card so the four
    cardinal slots maintain identical geometry whether or not a play
    has landed in them. Dimmed dashed border reads as "this position is
    waiting for a card" without competing with the real plays for
    attention.
  */
  .play-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    /*
      Match the play wrapper's vertical rhythm — a real `.play` adds a
      small seat label above the card, so we add the same padding-top
      to keep the placeholder's card centred at the same y as a real
      play's card.
    */
    padding-block-start: calc(var(--space-2) + 1em);
  }
  .card-placeholder {
    inline-size: var(--card-w);
    block-size: var(--card-h);
    border-radius: var(--radius-card);
    border: 2px dashed hsla(0, 0%, 100%, 0.18);
    background-color: hsla(0, 0%, 100%, 0.025);
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .play {
      animation: none;
    }
  }
</style>
