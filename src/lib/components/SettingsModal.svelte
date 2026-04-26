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

  let darkMode = $state(getPref('darkMode') ?? false);
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
  <fieldset class="grp">
    <legend>Difficulty</legend>
    <label><input type="radio" name="diff" value="easy" checked={difficulty.value === 'easy'} onchange={() => pickDifficulty('easy')} /> Easy</label>
    <label><input type="radio" name="diff" value="medium" checked={difficulty.value === 'medium'} onchange={() => pickDifficulty('medium')} /> Medium</label>
    <label class="disabled"><input type="radio" name="diff" value="hard" disabled /> Hard <span class="muted">(coming soon)</span></label>
  </fieldset>

  <Toggle value={darkMode} label="Dark mode" onchange={onDarkChange} />
  <Toggle value={soundOn} label="Sound" onchange={onSoundChange} />
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

  <label class="range">
    <span>Bot delay: {botDelayMs.value} ms</span>
    <input
      type="range"
      min="0"
      max="2000"
      step="50"
      value={botDelayMs.value}
      oninput={(e) => setBotDelay(Number((e.target as HTMLInputElement).value))}
    />
  </label>

  <div class="data-controls">
    <button type="button" onclick={onExport}>Export stats</button>
    <label class="import-btn">
      Import stats
      <input type="file" accept="application/json" onchange={onImport} hidden />
    </label>
  </div>
  {#if importStatus !== ''}<p class="muted">{importStatus}</p>{/if}
  <p class="muted">
    Clear-all-stats is not yet wired (no clear-all helper in the storage layer).
  </p>
</Modal>

<style>
  .grp {
    border: 1px solid hsla(0, 0%, 100%, 0.2);
    border-radius: 0.4rem;
    padding: var(--space-2, 0.5rem);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .grp legend {
    padding: 0 0.4rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  label.disabled {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .range {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .data-controls {
    display: flex;
    gap: var(--space-2, 0.5rem);
    align-items: center;
  }
  .data-controls button,
  .import-btn {
    padding: 0.4rem 0.8rem;
    border-radius: 0.4rem;
    border: 1px solid hsl(0, 0%, 60%);
    background-color: hsla(0, 0%, 100%, 0.1);
    color: var(--text-primary);
    cursor: pointer;
  }
</style>
