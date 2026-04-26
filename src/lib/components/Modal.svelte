<script lang="ts">
  /**
   * Reusable modal shell.
   *
   * Esc closes; backdrop click closes; focus is moved into the dialog on
   * mount. accessibility-expert will harden focus trap; this MVP delivers
   * the hooks (`role="dialog"`, `aria-modal="true"`, focus management).
   *
   * Owner: svelte-component-architect
   */
  import type { Snippet } from 'svelte';

  type Props = {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  };

  let { open, title, onclose, children }: Props = $props();

  let dialogEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (open && dialogEl !== undefined) {
      // Focus the first focusable element, or the dialog itself.
      const focusable = dialogEl.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable !== null) {
        focusable.focus();
      } else {
        dialogEl.focus();
      }
    }
  });

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) onclose();
  }
</script>

{#if open}
  <div
    class="backdrop"
    onclick={onBackdrop}
    onkeydown={onKey}
    role="presentation"
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      bind:this={dialogEl}
    >
      <header class="dlg-hdr">
        <h2>{title}</h2>
        <button type="button" class="close" aria-label="Close" onclick={onclose}>×</button>
      </header>
      <div class="body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: hsla(0, 0%, 0%, 0.6);
    display: grid;
    place-items: center;
    z-index: 100;
  }
  .dialog {
    background-color: var(--table-felt);
    color: var(--text-primary);
    padding: var(--space-3, 1rem);
    border-radius: var(--radius-card, 0.5rem);
    min-inline-size: min(32rem, 90vw);
    max-block-size: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 16px hsla(0, 0%, 0%, 0.5);
  }
  .dlg-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-block-end: var(--space-2, 0.5rem);
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
  }
</style>
