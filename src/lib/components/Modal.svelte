<script lang="ts">
  /**
   * Reusable modal shell.
   *
   * Esc closes; backdrop click closes. Focus is moved into the dialog on
   * open, trapped inside the dialog while open (Tab from the last
   * focusable cycles to the first, Shift+Tab from the first cycles to
   * the last), and returned to the element that triggered the open on
   * close.
   *
   * Hardened by accessibility-expert per WCAG 2.2 SC 2.1.2 (no keyboard
   * trap), 2.4.3 (focus order), and 3.2.1 (on focus — predictable).
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

  /**
   * The element that had focus when the modal opened. Restored on close
   * so keyboard users return to the trigger button.
   */
  let triggerEl: HTMLElement | null = null;

  $effect(() => {
    if (open && dialogEl !== undefined) {
      // Capture the trigger so we can restore focus on close.
      const active = document.activeElement;
      triggerEl = active instanceof HTMLElement ? active : null;
      // Focus the first focusable element, or the dialog itself.
      const focusable = getFocusable(dialogEl);
      if (focusable.length > 0) {
        focusable[0]!.focus();
      } else {
        dialogEl.focus();
      }
    }
  });

  /**
   * Watch the `open` prop falling to false to restore focus to the
   * trigger. Using a separate effect avoids race conditions with the
   * one above (they observe different transitions).
   */
  let wasOpen = $state(false);
  $effect(() => {
    if (wasOpen && !open) {
      // Modal just closed — return focus to the opener if it's still in
      // the document and focusable.
      if (triggerEl !== null && document.contains(triggerEl)) {
        triggerEl.focus();
      }
      triggerEl = null;
    }
    wasOpen = open;
  });

  /**
   * Collect tab-focusable elements within the dialog. Order follows DOM
   * order (the standard tab order). Hidden / disabled elements are
   * filtered out.
   */
  function getFocusable(root: HTMLElement): HTMLElement[] {
    const selector =
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(selector));
    return candidates.filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      // Skip elements with display:none / visibility:hidden ancestors.
      // offsetParent === null is a fast proxy except for position:fixed,
      // which is not used inside our dialogs.
      if (el.offsetParent === null && el.tagName !== 'BODY') return false;
      return true;
    });
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key === 'Tab' && dialogEl !== undefined) {
      const focusable = getFocusable(dialogEl);
      if (focusable.length === 0) {
        // Keep focus on the dialog itself.
        e.preventDefault();
        dialogEl.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialogEl.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  function onBackdrop(_e: MouseEvent): void {
    // The backdrop is a sibling of the dialog, so any click that lands on it
    // is by definition outside the dialog — no need to compare target vs
    // currentTarget the way we did when the dialog was nested inside.
    onclose();
  }
</script>

{#if open}
  <!--
    Backdrop and dialog are SIBLINGS, not parent/child. If the dialog were a
    child of an aria-hidden="true" backdrop, the hidden state would cascade to
    the dialog and remove it from the AT tree (axe rule: aria-hidden + dialog).
    The wrapper .modal-root has no role and no aria-hidden so it does not
    affect the AT tree.

    The backdrop is purely visual (it provides the dim/blur scrim and captures
    click-outside-to-dismiss). aria-modal="true" on the dialog already tells
    AT that everything outside the dialog is inert, so we omit aria-hidden on
    the backdrop entirely.
  -->
  <div class="modal-root">
    <div class="backdrop" onclick={onBackdrop} role="presentation"></div>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      bind:this={dialogEl}
      onkeydown={onKey}
    >
      <header class="dlg-hdr">
        <h2 id="modal-title">{title}</h2>
        <button type="button" class="btn-icon" aria-label="Close" onclick={onclose}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  /* The wrapper has no role/aria-hidden so it doesn't affect the AT tree.
     It exists only to scope the fixed-position backdrop+dialog pair. */
  .modal-root {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: grid;
    place-items: center;
    padding: var(--space-4);
    pointer-events: none;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--bg-modal-backdrop);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: auto;
    animation: modal-fade-in var(--duration-normal) var(--easing-standard);
  }
  .dialog {
    position: relative;
    background-color: var(--bg-modal-surface);
    color: var(--text-primary);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-subtle);
    inline-size: min(600px, 100%);
    max-block-size: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-modal);
    animation: modal-scale-in var(--duration-normal) var(--easing-emphasized);
    pointer-events: auto;
  }
  .dlg-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    margin-block-end: var(--space-4);
    padding-block-end: var(--space-3);
    border-block-end: 1px solid var(--border-subtle);
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--text-primary);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .dialog {
      animation: none;
    }
  }
</style>
