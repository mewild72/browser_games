<script lang="ts">
  /**
   * Euchre app shell.
   *
   * Owns the install-effects call (must run inside a reactive component),
   * the top-level navigation buttons, and modal open/close state. The
   * actual game view is delegated to <GameTable>.
   *
   * Owner: svelte-component-architect
   */
  import GameTable from '@/lib/components/GameTable.svelte';
  import SettingsModal from '@/lib/components/SettingsModal.svelte';
  import StatsModal from '@/lib/components/StatsModal.svelte';
  import {
    installEffects,
    startNewGameSession,
  } from '@/lib/game/state.svelte';

  // Boot the bot loop and persistence effects.
  installEffects();

  // Kick off an initial game so users land on a playable table on first paint.
  void startNewGameSession();

  let settingsOpen = $state(false);
  let statsOpen = $state(false);

  function openSettings(): void {
    settingsOpen = true;
  }
  function closeSettings(): void {
    settingsOpen = false;
  }
  function openStats(): void {
    statsOpen = true;
  }
  function closeStats(): void {
    statsOpen = false;
  }
  function newGame(): void {
    void startNewGameSession();
  }
</script>

<main>
  <header class="topbar">
    <h1>Euchre</h1>
    <nav class="nav">
      <button type="button" onclick={newGame}>New game</button>
      <button type="button" onclick={openStats}>Stats</button>
      <button type="button" onclick={openSettings}>Settings</button>
    </nav>
  </header>

  <GameTable />

  <SettingsModal open={settingsOpen} onclose={closeSettings} />
  <StatsModal open={statsOpen} onclose={closeStats} />
</main>

<style>
  main {
    min-block-size: 100dvh;
    background-color: var(--table-felt);
    color: var(--text-primary);
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2, 0.5rem) var(--space-3, 1rem);
    background-color: hsla(0, 0%, 0%, 0.3);
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: 0.02em;
  }
  .nav {
    display: flex;
    gap: var(--space-2, 0.5rem);
  }
  .nav button {
    padding: 0.4rem 0.8rem;
    border-radius: 0.4rem;
    border: 1px solid hsla(0, 0%, 100%, 0.3);
    background-color: hsla(0, 0%, 100%, 0.1);
    color: var(--text-primary);
    cursor: pointer;
  }
  .nav button:hover {
    background-color: hsla(0, 0%, 100%, 0.2);
  }
</style>
