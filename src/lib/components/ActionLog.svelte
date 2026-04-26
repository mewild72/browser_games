<script lang="ts">
  /**
   * Live region announcing game events to screen readers, plus a visible
   * chronological log for sighted users.
   *
   * Owner: svelte-component-architect
   */
  import type { LogEntry } from '@/lib/game/state.svelte';

  type Props = {
    entries: readonly LogEntry[];
    /** How many recent entries to show in the visible list. */
    limit?: number;
  };

  let { entries, limit = 12 }: Props = $props();

  const recent = $derived(entries.slice(-limit).reverse());
  const latest = $derived(entries.length === 0 ? '' : entries[entries.length - 1]!.text);
</script>

<aside class="action-log" aria-labelledby="action-log-heading">
  <h3 id="action-log-heading" class="visible-heading">Log</h3>
  <!-- Visually-hidden live region; the visible <ol> below is the same data
       in chronological reverse for sighted users. aria-live="polite" announces
       new entries without interrupting screen-reader speech. -->
  <div class="live" aria-live="polite" aria-atomic="true">{latest}</div>
  <!-- tabindex="0" lets keyboard users focus the list and scroll it with the
       arrow keys / page keys (axe rule: scrollable-region-focusable). The
       Svelte a11y rule "no noninteractive tabindex" is correct in general but
       the axe rule it conflicts with takes precedence for scrollable regions:
       a sighted keyboard user must be able to reach this scroll container. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <ol tabindex="0" aria-label="Recent actions">
    {#each recent as entry (entry.id)}
      <li>{entry.text}</li>
    {/each}
  </ol>
</aside>

<style>
  .action-log {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background-color: var(--bg-surface);
    border-radius: var(--radius-lg);
    color: var(--text-on-felt);
    border: 1px solid var(--border-subtle);
    max-block-size: 18rem;
    overflow: hidden;
    box-shadow: var(--shadow-panel);
  }
  .visible-heading {
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .live {
    /* Visually hidden but read by AT. */
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  ol {
    list-style: none;
    padding-inline-start: 0;
    margin: 0;
    overflow-y: auto;
    max-block-size: 14rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
    /* Custom scrollbar styling — best-effort, falls back to UA default. */
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  ol li {
    font-size: var(--font-size-sm);
    color: var(--text-on-felt);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    line-height: 1.35;
  }
  ol li:nth-child(odd) {
    background-color: hsla(0, 0%, 0%, 0.15);
  }
  /* The newest entry (index 0 because we reverse) gets a subtle accent. */
  ol li:first-child {
    background-color: hsla(45, 30%, 14%, 0.55);
    border-inline-start: 2px solid var(--accent);
  }
</style>
