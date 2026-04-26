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

<aside class="action-log" aria-label="Action log">
  <h4>Log</h4>
  <div class="live" aria-live="polite" aria-atomic="true">{latest}</div>
  <ol>
    {#each recent as entry (entry.id)}
      <li>{entry.text}</li>
    {/each}
  </ol>
</aside>

<style>
  .action-log {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    padding: var(--space-2, 0.5rem);
    background-color: hsla(0, 0%, 0%, 0.2);
    border-radius: var(--radius-card, 0.5rem);
    color: var(--text-primary);
    max-block-size: 14rem;
    overflow: hidden;
  }
  h4 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .live {
    /* Visually hidden but read by AT — accessibility-expert may polish. */
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
    list-style: decimal;
    padding-inline-start: var(--space-3, 1rem);
    margin: 0;
    overflow-y: auto;
    max-block-size: 11rem;
  }
  ol li {
    font-size: 0.85rem;
  }
</style>
