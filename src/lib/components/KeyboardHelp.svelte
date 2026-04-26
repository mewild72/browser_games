<script lang="ts">
  /**
   * Keyboard shortcut help overlay.
   *
   * Triggered globally with `?` (Shift+/). Lists every shortcut the app
   * exposes so keyboard-only users can learn the controls without
   * trial-and-error. Owned by accessibility-expert; uses the shared
   * <Modal> shell so focus management and Esc handling are consistent
   * across overlays.
   */
  import Modal from './Modal.svelte';

  type Props = {
    open: boolean;
    onclose: () => void;
  };

  let { open, onclose }: Props = $props();

  type Shortcut = {
    keys: readonly string[];
    description: string;
  };

  const shortcuts: readonly Shortcut[] = [
    { keys: ['Tab'], description: 'Move focus to the next interactive element' },
    { keys: ['Shift', 'Tab'], description: 'Move focus to the previous element' },
    { keys: ['Enter'], description: 'Activate the focused button or play the focused card' },
    { keys: ['Space'], description: 'Activate the focused button or toggle' },
    { keys: ['\u2190', '\u2192'], description: 'Move between cards in your hand' },
    { keys: ['Home'], description: 'Jump to the first card in your hand' },
    { keys: ['End'], description: 'Jump to the last card in your hand' },
    { keys: ['Esc'], description: 'Close any open dialog (settings, stats, this help)' },
    { keys: ['?'], description: 'Open this keyboard help overlay' },
  ];
</script>

<Modal {open} {onclose} title="Keyboard shortcuts">
  <p class="intro">
    Every part of the game is reachable by keyboard. Bot moves are announced in
    the action log so screen-reader users hear what happened.
  </p>
  <dl class="shortcuts">
    {#each shortcuts as s (s.description)}
      <div class="row">
        <dt>
          {#each s.keys as key, i (key)}
            <kbd>{key}</kbd>{#if i < s.keys.length - 1}<span aria-hidden="true">+</span>{/if}
          {/each}
        </dt>
        <dd>{s.description}</dd>
      </div>
    {/each}
  </dl>
</Modal>

<style>
  .intro {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-on-felt);
  }
  .shortcuts {
    display: grid;
    gap: var(--space-2);
    margin: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 12rem 1fr;
    gap: var(--space-3);
    align-items: baseline;
  }
  dt {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }
  dt span {
    color: var(--text-muted);
    font-weight: 600;
  }
  dd {
    margin: 0;
    color: var(--text-on-felt);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
  }
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 1.5rem;
    padding: 0 var(--space-2);
    block-size: 1.5rem;
    border-radius: var(--radius-sm);
    background-color: var(--bg-surface-raised);
    border: 1px solid var(--border-strong);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 600;
    line-height: 1;
  }
  /* Stack rows on narrow screens so the kbd column doesn't squeeze the
     description. */
  @media (max-width: 599px) {
    .row {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }
</style>
