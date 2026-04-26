<script lang="ts">
  /**
   * Euchre app shell.
   *
   * Owns the install-effects call (must run inside a reactive component),
   * the top-level navigation buttons, and modal open/close state. The
   * actual game view is delegated to <GameTable>.
   *
   * Owner: svelte-component-architect (logic); css-expert (visual layer
   * via .app-shell / .topbar / .btn classes from layout.css).
   */
  import GameTable from '@/lib/components/GameTable.svelte';
  import KeyboardHelp from '@/lib/components/KeyboardHelp.svelte';
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
  let helpOpen = $state(false);

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
  function openHelp(): void {
    helpOpen = true;
  }
  function closeHelp(): void {
    helpOpen = false;
  }
  function newGame(): void {
    void startNewGameSession();
  }

  /**
   * Global "?" shortcut — opens the keyboard help overlay.
   *
   * Registered on window so the binding works regardless of which
   * element has focus (except inside text inputs, where typing "?"
   * obviously must not steal the keystroke). Modal Esc handling is
   * already covered by the shared <Modal>.
   */
  function onWindowKeydown(e: KeyboardEvent): void {
    // Ignore when the user is typing into an input/textarea/contenteditable.
    const target = e.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
    }
    // Don't interfere with browser shortcuts.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') {
      e.preventDefault();
      openHelp();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="app-shell">
  <!--
    Top-level <header> at the document root is the banner landmark by
    default — explicit role="banner" is redundant (and Svelte's a11y rule
    `a11y_no_redundant_roles` flags it). Same for <main>'s role="main".
  -->
  <header class="topbar">
    <h1>Euchre</h1>
    <nav aria-label="Game controls">
      <button type="button" class="btn btn-primary" onclick={newGame}>New game</button>
      <button type="button" class="btn btn-ghost" onclick={openStats}>Stats</button>
      <button type="button" class="btn btn-ghost" onclick={openSettings}>Settings</button>
      <button
        type="button"
        class="btn btn-ghost"
        onclick={openHelp}
        aria-label="Keyboard shortcuts (?)"
        title="Keyboard shortcuts (?)"
      >?</button>
    </nav>
  </header>

  <main id="main-content">
    <GameTable />
  </main>

  <SettingsModal open={settingsOpen} onclose={closeSettings} />
  <StatsModal open={statsOpen} onclose={closeStats} />
  <KeyboardHelp open={helpOpen} onclose={closeHelp} />
</div>
