<script lang="ts">
  /**
   * Settings modal: difficulty, dark mode, sound, variant toggles, bot
   * delay, export/import stats.
   *
   * Owner: svelte-component-architect
   */
  import type { Difficulty } from '@/lib/ai';
  import type { Variants } from '@/lib/types';
  import Modal from './Modal.svelte';
  import Toggle from './Toggle.svelte';
  import {
    botDelayMs,
    difficulty,
    setBotDelay,
    setDifficulty,
    setVariants,
    variants,
  } from '@/lib/game/state.svelte';
  import { exportAll, getPref, importAll, setPref } from '@/lib/storage';

  type Props = {
    open: boolean;
    onclose: () => void;
  };

  let { open, onclose }: Props = $props();

  // Default to dark mode when no pref is stored — matches the visual
  // default applied in main.ts (the felt/dark theme is the canonical look).
  let darkMode = $state(getPref('darkMode') ?? true);
  let soundOn = $state(getPref('soundOn') ?? false);
  let importStatus = $state('');

  $effect(() => {
    // Wire dark-mode pref to the body data-theme attribute (placeholder).
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    }
  });

  function pickDifficulty(d: Difficulty): void {
    setDifficulty(d);
  }

  function setStickDealer(next: boolean): void {
    const v: Variants = { ...variants.value, stickTheDealer: next };
    setVariants(v);
  }

  function setAllowAlone(next: boolean): void {
    const v: Variants = { ...variants.value, allowGoingAlone: next };
    setVariants(v);
  }

  async function onExport(): Promise<void> {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `euchre-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImport(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    if (!confirm('Importing replaces all existing stats. Continue?')) {
      input.value = '';
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Parameters<typeof importAll>[0];
      await importAll(parsed);
      importStatus = 'Import complete.';
    } catch (err) {
      importStatus = `Import failed: ${(err as Error).message}`;
    } finally {
      input.value = '';
    }
  }

  function onSoundChange(next: boolean): void {
    soundOn = next;
    setPref('soundOn', next);
  }
  function onDarkChange(next: boolean): void {
    darkMode = next;
    setPref('darkMode', next);
  }
</script>

<Modal {open} {onclose} title="Settings">
  <!--
    Settings is a preferences form. Each control persists on change (no
    explicit submit), so the <form> has no action/method and submission is
    suppressed via onsubmit preventDefault. <fieldset>/<legend> groups the
    radio set; toggle / range controls are siblings.
  -->
  <form class="settings-form" onsubmit={(e) => e.preventDefault()}>
    <fieldset class="grp">
      <legend>Difficulty</legend>
      <label><input type="radio" name="diff" value="easy" checked={difficulty.value === 'easy'} onchange={() => pickDifficulty('easy')} /> Easy</label>
      <label><input type="radio" name="diff" value="medium" checked={difficulty.value === 'medium'} onchange={() => pickDifficulty('medium')} /> Medium</label>
      <label class="disabled"><input type="radio" name="diff" value="hard" disabled /> Hard <span class="muted">(coming soon)</span></label>
    </fieldset>

    <fieldset class="grp">
      <legend>Display & sound</legend>
      <Toggle value={darkMode} label="Dark mode" onchange={onDarkChange} />
      <Toggle value={soundOn} label="Sound" onchange={onSoundChange} />
    </fieldset>

    <fieldset class="grp">
      <legend>Variants</legend>
      <Toggle
        value={variants.value.stickTheDealer}
        label="Stick the dealer"
        onchange={setStickDealer}
      />
      <Toggle
        value={variants.value.allowGoingAlone}
        label="Going alone"
        onchange={setAllowAlone}
      />
    </fieldset>

    <label class="range" for="bot-delay">
      <span>Bot delay: {botDelayMs.value} ms</span>
      <input
        id="bot-delay"
        type="range"
        min="0"
        max="2000"
        step="50"
        value={botDelayMs.value}
        oninput={(e) => setBotDelay(Number((e.target as HTMLInputElement).value))}
      />
    </label>

    <div class="data-controls" role="group" aria-label="Stats data">
      <button type="button" class="btn btn-secondary" onclick={onExport}>Export stats</button>
      <label class="btn btn-secondary import-btn">
        Import stats
        <input type="file" accept="application/json" onchange={onImport} hidden />
      </label>
    </div>
    {#if importStatus !== ''}<p class="muted" role="status" aria-live="polite">{importStatus}</p>{/if}
    <p class="muted">
      Clear-all-stats is not yet wired (no clear-all helper in the storage layer).
    </p>
  </form>
</Modal>

<style>
  .settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .grp {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    background-color: hsla(0, 0%, 0%, 0.18);
  }
  .grp legend {
    padding: 0 var(--space-2);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
  }
  .grp label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }
  .grp input[type="radio"] {
    accent-color: var(--accent);
    inline-size: 1rem;
    block-size: 1rem;
  }
  label.disabled {
    color: var(--text-disabled);
  }
  .muted {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
  .range {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }
  .range input[type="range"] {
    inline-size: 100%;
    accent-color: var(--accent);
    block-size: 1.5rem;
  }
  .range input[type="range"]:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .data-controls {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .import-btn {
    /* The .btn .btn-secondary classes handle visuals; this just lets the
       label-as-button stay clickable and labelable. */
    cursor: pointer;
  }
</style>
