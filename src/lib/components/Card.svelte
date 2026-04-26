<script lang="ts">
  /**
   * Single card. Placeholder text art until css-expert ships SVG assets.
   *
   * If `onclick` is undefined, the card renders as non-interactive (a
   * decorative span) and is dimmed when also marked `dimmed`. If
   * `onclick` is supplied, the card becomes an interactive button.
   *
   * Owner: svelte-component-architect
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
    <span class="rank">{card.rank}</span><span class="suit">{suitGlyph(card.suit)}</span>
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
      <span class="back" aria-hidden="true">\u00A0</span>
    {:else if card !== undefined}
      <span class="rank">{card.rank}</span><span class="suit">{suitGlyph(card.suit)}</span>
    {/if}
  </span>
{/if}

<style>
  .card {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 3rem;
    block-size: 4.25rem;
    border-radius: var(--radius-card, 0.5rem);
    background-color: hsl(0, 0%, 98%);
    color: hsl(0, 0%, 12%);
    font-size: 1.1rem;
    font-weight: 600;
    box-shadow: var(--shadow-card);
    border: 1px solid hsl(0, 0%, 80%);
    user-select: none;
    padding: 0;
  }

  .card.red {
    color: hsl(0, 70%, 40%);
  }

  .card.face-down {
    background: repeating-linear-gradient(
      45deg,
      hsl(220, 50%, 25%),
      hsl(220, 50%, 25%) 6px,
      hsl(220, 50%, 35%) 6px,
      hsl(220, 50%, 35%) 12px
    );
    color: transparent;
    border-color: hsl(220, 50%, 20%);
  }

  .card.dimmed {
    opacity: 0.45;
  }

  button.card.playable {
    cursor: pointer;
    transition: transform var(--duration-fast, 150ms) ease;
  }
  button.card.playable:hover,
  button.card.playable:focus-visible {
    transform: translateY(-4px);
  }

  button.card.selected {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .rank {
    margin-inline-end: 1px;
  }

  .suit {
    font-size: 1.1rem;
  }
</style>
