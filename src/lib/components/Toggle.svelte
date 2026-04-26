<script lang="ts">
  /**
   * Mandatory pill toggle (replaces every checkbox).
   *
   * Per CLAUDE.md "UI Component Standards", every boolean control in the
   * app uses this component. There are no `<input type="checkbox">` in the
   * visible UI.
   *
   * Owner: svelte-component-architect (markup, behavior); css-expert
   * (visual polish later).
   */
  type Props = {
    value: boolean;
    label: string;
    onchange: (next: boolean) => void;
    labelHidden?: boolean;
    disabled?: boolean;
    size?: 'default' | 'large';
  };

  let {
    value,
    label,
    onchange,
    labelHidden = false,
    disabled = false,
    size = 'default',
  }: Props = $props();

  function toggle(): void {
    if (disabled) return;
    onchange(!value);
  }

  function onKey(e: KeyboardEvent): void {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<span class="toggle-row" class:label-hidden={labelHidden}>
  {#if !labelHidden}
    <span class="label">{label}</span>
  {/if}
  <button
    type="button"
    role="switch"
    class="toggle"
    class:large={size === 'large'}
    class:on={value}
    aria-checked={value}
    aria-label={labelHidden ? label : undefined}
    disabled={disabled}
    onclick={toggle}
    onkeydown={onKey}
  >
    <span class="handle" aria-hidden="true"></span>
  </button>
</span>

<style>
  .toggle-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
  }
  .toggle-row.label-hidden {
    gap: 0;
  }

  .label {
    font-size: 0.95rem;
  }

  .toggle {
    --w: 36px;
    --h: 20px;
    inline-size: var(--w);
    block-size: var(--h);
    border: none;
    padding: 0;
    border-radius: 999px;
    background-color: var(--toggle-off);
    position: relative;
    cursor: pointer;
    transition: background-color var(--duration-fast, 150ms) ease;
  }
  .toggle.large {
    --w: 52px;
    --h: 28px;
  }
  .toggle.on {
    background-color: var(--toggle-on);
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .handle {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: 2px;
    inline-size: calc(var(--h) - 4px);
    block-size: calc(var(--h) - 4px);
    border-radius: 50%;
    background-color: var(--toggle-handle);
    box-shadow: 0 1px 2px hsla(0, 0%, 0%, 0.35);
    transition: transform var(--duration-fast, 150ms) ease;
  }
  .toggle.on .handle {
    transform: translateX(calc(var(--w) - var(--h)));
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle,
    .handle {
      transition: none;
    }
  }
</style>
