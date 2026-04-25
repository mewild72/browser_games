<script lang="ts">
  // Placeholder app shell. Real game UI is built by svelte-component-architect,
  // css-expert, and accessibility-expert per CLAUDE.md.
</script>

<main>
  <h1>Euchre</h1>
</main>

<style>
  main {
    min-block-size: 100dvh;
    display: grid;
    place-items: center;
    color: var(--text-primary);
    background-color: var(--table-felt);
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 5vw, 4rem);
    letter-spacing: 0.02em;
  }
</style>
