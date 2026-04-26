<script lang="ts">
  /**
   * Mandatory pill toggle (replaces every checkbox).
   *
   * Per CLAUDE.md "UI Component Standards", every boolean control in the
   * app uses this component. There are no `<input type="checkbox">` in the
   * visible UI.
   *
   * Visual: a 36×20px (default) or 52×28px (large) rounded pill, filled
   * with --toggle-on (green) when on or --toggle-off (grey) when off, with
   * a white circular handle that animates from left edge to right edge.
   * The 44×44px click target is enforced via padding around the visible
   * pill so the visible pill stays compact.
   *
   * Owner: svelte-component-architect (markup, behavior); css-expert
   * (visual layer).
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

  // Stable per-instance id (Svelte 5.20+ $props.id rune). The visible label
  // is associated with the switch via aria-labelledby={labelId}.
  const componentId = $props.id();
  const labelId = `${componentId}-toggle-label`;
</script>

<span class="toggle-row" class:label-hidden={labelHidden}>
  {#if !labelHidden}
    <span class="label" id={labelId}>{label}</span>
  {/if}
  <button
    type="button"
    role="switch"
    class="toggle"
    class:large={size === 'large'}
    class:on={value}
    aria-checked={value}
    aria-labelledby={labelHidden ? undefined : labelId}
    aria-label={labelHidden ? label : undefined}
    disabled={disabled}
    onclick={toggle}
    onkeydown={onKey}
  >
    <span class="pill" aria-hidden="true">
      <span class="handle"></span>
    </span>
  </button>
</span>

<style>
  .toggle-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }
  .toggle-row.label-hidden {
    gap: 0;
  }

  .label {
    font-size: var(--font-size-sm);
    color: var(--text-on-felt);
  }

  /*
    The button is the click target — it carries the 44×44 floor (WCAG 2.2
    SC 2.5.5). Inside it sits the visible .pill, which keeps the compact
    36×20 (or 52×28 large) visual. Because the button has no background of
    its own, the larger hit area is invisible — clicks anywhere in the
    44×44 box still trigger the toggle.
  */
  .toggle {
    --pill-w: 36px;
    --pill-h: 20px;
    min-inline-size: 44px;
    min-block-size: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-pill);
  }
  .toggle.large {
    --pill-w: 52px;
    --pill-h: 28px;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pill {
    position: relative;
    display: inline-block;
    inline-size: var(--pill-w);
    block-size: var(--pill-h);
    border-radius: var(--radius-pill);
    background-color: var(--toggle-off);
    box-shadow: inset 0 1px 2px hsla(0, 0%, 0%, 0.25);
    transition: background-color var(--duration-fast) var(--easing-standard);
  }
  .toggle.on .pill {
    background-color: var(--toggle-on);
  }

  .handle {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: 2px;
    inline-size: calc(var(--pill-h) - 4px);
    block-size: calc(var(--pill-h) - 4px);
    border-radius: 50%;
    background-color: var(--toggle-handle);
    box-shadow:
      0 1px 2px hsla(0, 0%, 0%, 0.4),
      0 0 0 0.5px hsla(0, 0%, 0%, 0.1);
    transition: transform var(--duration-fast) var(--easing-standard);
  }
  .toggle.on .handle {
    transform: translateX(calc(var(--pill-w) - var(--pill-h)));
  }

  /* Focus ring on the button (the click target), not the pill — keeps the
     ring visible and aligned to the actual interactive area. */
  .toggle:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-pill);
  }

  @media (prefers-reduced-motion: reduce) {
    .pill,
    .handle {
      transition: none;
    }
  }
</style>
