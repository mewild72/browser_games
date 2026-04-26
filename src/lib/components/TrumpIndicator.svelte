<script lang="ts">
  /**
   * Prominent trump-suit indicator for the play area.
   *
   * Displayed in the centre of the table during the `playing` phase so
   * the human is never more than a glance away from "what's trump?".
   * The trump banner in the scoreboard above is small and easy to lose
   * track of mid-trick — this is the one that lives where the eyes
   * already are.
   *
   * Visual: an ornate decorative suit symbol rendered from the bundled
   * WebP at `src/assets/cards/optimized/suits/{club|diamond|heart|spade}.webp`
   * via `suitUrls`. If the bundled URL is unavailable (e.g. asset not
   * yet generated), the component falls back to the unicode glyph in
   * the appropriate suit colour (`--suit-red-on-felt` for hearts /
   * diamonds, `--suit-black-on-felt` for spades / clubs — the
   * `-on-felt` variants pass contrast against the green-felt
   * background, unlike the `--suit-red` / `--suit-black` tokens that
   * target the cream card surface). A small uppercase "TRUMP" label
   * sits beside the symbol.
   *
   * Sizing variants: `size="large"` is the default centre presentation
   * shown while no trick is in progress; `size="small"` is the corner
   * presentation used while a trick is being played so the banner
   * doesn't fight the cards for attention.
   *
   * Owner: svelte-component-architect
   */
  import type { Suit } from '@/lib/types';
  import { suitUrls } from '@/lib/cards/art';

  type Props = {
    suit: Suit;
    size?: 'large' | 'small';
  };

  let { suit, size = 'large' }: Props = $props();

  function suitGlyph(s: Suit): string {
    switch (s) {
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

  const isRed = $derived(suit === 'hearts' || suit === 'diamonds');
  const ariaLabel = $derived(`Trump suit: ${suit}`);
  const imageUrl = $derived(suitUrls[suit]);
</script>

<div
  class="trump-indicator"
  class:red={isRed}
  class:large={size === 'large'}
  class:small={size === 'small'}
  role="img"
  aria-label={ariaLabel}
>
  <span class="symbol" aria-hidden="true">
    {#if imageUrl !== undefined}
      <img class="symbol-img" src={imageUrl} alt="" />
    {:else}
      <span class="symbol-glyph">{suitGlyph(suit)}</span>
    {/if}
  </span>
  <span class="label" aria-hidden="true">Trump</span>
</div>

<style>
  .trump-indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-pill);
    background-color: hsla(0, 0%, 0%, 0.4);
    border: 1px solid var(--border-subtle);
    color: var(--suit-black-on-felt);
    font-family: var(--font-card);
    line-height: 1;
    user-select: none;
  }
  .trump-indicator.red {
    color: var(--suit-red-on-felt);
  }
  .symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Sized via the wrapper; image scales to fit. The glyph fallback
       picks up font-size from `.symbol-glyph` below. */
    inline-size: 2.75rem;
    block-size: 2.75rem;
    line-height: 1;
  }
  .symbol-img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
    display: block;
  }
  .symbol-glyph {
    font-size: 2.75rem;
    line-height: 1;
  }
  .label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 700;
    color: var(--text-on-felt);
  }
  /* Smaller variant — used when a trick is in progress so the cards
     stay the centre of attention. */
  .trump-indicator.small {
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
  }
  .trump-indicator.small .symbol {
    inline-size: 1.5rem;
    block-size: 1.5rem;
  }
  .trump-indicator.small .symbol-glyph {
    font-size: 1.5rem;
  }
  .trump-indicator.small .label {
    font-size: 0.625rem;
  }
</style>
