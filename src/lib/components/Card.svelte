<script lang="ts">
  /**
   * Single card. Placeholder text art until SVG assets ship — the visual
   * styling makes the placeholder rank+suit look intentional rather than
   * unfinished. Layout: corner indices (top-left and bottom-right rotated)
   * plus a large center suit glyph, in the suit color, on a cream face.
   *
   * If `onclick` is undefined, the card renders as non-interactive (a
   * decorative span) and is dimmed when also marked `dimmed`. If
   * `onclick` is supplied, the card becomes an interactive button.
   *
   * Owner: svelte-component-architect (markup); css-expert (visual).
   */
  import type { Card } from '@/lib/types';

  type Props = {
    card: Card | undefined;
    faceDown?: boolean;
    onclick?: (() => void) | undefined;
    dimmed?: boolean;
    selected?: boolean;
    ariaLabel?: string;
  };

  let {
    card,
    faceDown = false,
    onclick = undefined,
    dimmed = false,
    selected = false,
    ariaLabel,
  }: Props = $props();

  const isRed = $derived(
    card === undefined ? false : card.suit === 'hearts' || card.suit === 'diamonds',
  );

  function suitGlyph(suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'): string {
    switch (suit) {
      case 'clubs':
        return '\u2663';
      case 'diamonds':
        return '\u2666';
      case 'hearts':
        return '\u2665';
      case 'spades':
        return '\u2660';
    }
  }

  const labelText = $derived(
    ariaLabel !== undefined
      ? ariaLabel
      : faceDown
        ? 'Face-down card'
        : card === undefined
          ? 'Empty card slot'
          : `${card.rank} of ${card.suit}`,
  );
</script>

{#if onclick !== undefined && !faceDown && card !== undefined}
  <button
    type="button"
    class="card playable"
    class:dimmed
    class:selected
    class:red={isRed}
    aria-label={labelText}
    onclick={onclick}
  >
    <span class="corner top-left" aria-hidden="true">
      <span class="corner-rank">{card.rank}</span>
      <span class="corner-suit">{suitGlyph(card.suit)}</span>
    </span>
    <span class="center-suit" aria-hidden="true">{suitGlyph(card.suit)}</span>
    <span class="corner bottom-right" aria-hidden="true">
      <span class="corner-rank">{card.rank}</span>
      <span class="corner-suit">{suitGlyph(card.suit)}</span>
    </span>
  </button>
{:else}
  <span
    class="card"
    class:face-down={faceDown}
    class:dimmed
    class:red={isRed}
    role="img"
    aria-label={labelText}
  >
    {#if faceDown}
      <span class="back-pattern" aria-hidden="true"></span>
    {:else if card !== undefined}
      <span class="corner top-left" aria-hidden="true">
        <span class="corner-rank">{card.rank}</span>
        <span class="corner-suit">{suitGlyph(card.suit)}</span>
      </span>
      <span class="center-suit" aria-hidden="true">{suitGlyph(card.suit)}</span>
      <span class="corner bottom-right" aria-hidden="true">
        <span class="corner-rank">{card.rank}</span>
        <span class="corner-suit">{suitGlyph(card.suit)}</span>
      </span>
    {/if}
  </span>
{/if}

<style>
  .card {
    position: relative;
    display: inline-flex;
    inline-size: var(--card-w);
    block-size: var(--card-h);
    border-radius: var(--radius-card);
    background-color: var(--bg-card);
    color: var(--suit-black);
    font-family: var(--font-card);
    font-weight: 600;
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-card);
    user-select: none;
    padding: 0;
    overflow: hidden;
    /* Subtle inner highlight on the top edge — feels like a lacquered card */
    background-image: linear-gradient(
      180deg,
      hsla(0, 0%, 100%, 0.6) 0%,
      hsla(0, 0%, 100%, 0) 8%
    );
    transition:
      transform var(--duration-fast) var(--easing-standard),
      box-shadow var(--duration-fast) var(--easing-standard),
      border-color var(--duration-fast) var(--easing-standard),
      opacity var(--duration-fast) var(--easing-standard);
  }

  .card.red {
    color: var(--suit-red);
  }

  .card.dimmed {
    opacity: 0.45;
    filter: saturate(0.6);
    cursor: not-allowed;
  }

  /* ---- Corner indices (rank + small suit) ---------------------------- */
  .corner {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
    font-size: calc(var(--card-w) * 0.18);
    letter-spacing: 0.01em;
  }
  .corner.top-left {
    inset-block-start: 6%;
    inset-inline-start: 8%;
  }
  .corner.bottom-right {
    inset-block-end: 6%;
    inset-inline-end: 8%;
    transform: rotate(180deg);
  }
  .corner-rank {
    font-weight: 700;
  }
  .corner-suit {
    font-size: calc(var(--card-w) * 0.16);
    margin-block-start: 1px;
  }

  /* ---- Big center suit ---------------------------------------------- */
  .center-suit {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--card-w) * 0.55);
    line-height: 1;
    /* Slight depth — center suit feels embossed rather than printed. */
    text-shadow: 0 1px 0 hsla(0, 0%, 100%, 0.6);
    pointer-events: none;
  }

  /* ---- Face-down card back ------------------------------------------ */
  .card.face-down {
    background-color: var(--bg-card-back);
    background-image:
      repeating-linear-gradient(
        45deg,
        hsla(0, 0%, 100%, 0.08) 0,
        hsla(0, 0%, 100%, 0.08) 4px,
        transparent 4px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -45deg,
        hsla(0, 0%, 100%, 0.08) 0,
        hsla(0, 0%, 100%, 0.08) 4px,
        transparent 4px,
        transparent 8px
      ),
      linear-gradient(
        135deg,
        var(--bg-card-back) 0%,
        var(--bg-card-back-accent) 100%
      );
    border-color: hsl(220, 50%, 18%);
  }
  .card.face-down .back-pattern {
    /* Inset white border to make the back feel finished. */
    position: absolute;
    inset: 6%;
    border-radius: calc(var(--radius-card) * 0.7);
    border: 1px solid hsla(0, 0%, 100%, 0.25);
    pointer-events: none;
  }

  /* ---- Interactive (playable) state --------------------------------- */
  button.card.playable {
    cursor: pointer;
    /* Ensure 44x44 click area at smaller breakpoints. The card itself is
       larger than 44 at default sizes; this guarantees the floor when
       --card-w drops on phones. */
    min-inline-size: 44px;
    min-block-size: 44px;
  }
  button.card.playable:hover:not(.dimmed),
  button.card.playable:focus-visible:not(.dimmed) {
    transform: translateY(-6px);
    box-shadow: var(--shadow-card-lift);
    border-color: var(--border-card-strong);
  }
  button.card.playable:active:not(.dimmed) {
    transform: translateY(-2px);
  }

  button.card.selected {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  /* Focus-visible ring takes precedence over :where() reset for cards. */
  button.card.playable:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 3px;
  }
</style>
