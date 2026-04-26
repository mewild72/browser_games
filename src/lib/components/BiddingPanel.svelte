<script lang="ts">
  /**
   * Bidding controls. Visible during 'bidding-round-1', 'bidding-round-2',
   * and 'dealer-discard'.
   *
   * Round 1: pass / order up / order up alone.
   * Round 2: pass / call (each non-rejected suit) / call alone.
   * Dealer discard: lists the dealer's hand and asks them to pick one.
   *
   * Only renders interactive when it is the human's turn. Otherwise shows
   * a status line ("Waiting for east to bid…").
   *
   * Owner: svelte-component-architect
   */
  import type { Action, Card, GameState, Suit } from '@/lib/types';
  import Toggle from './Toggle.svelte';
  import CardView from './Card.svelte';
  import { HUMAN_SEAT } from '@/lib/game/state.svelte';

  type Props = {
    gameState: GameState;
    onAction: (action: Action) => void;
  };

  let { gameState, onAction }: Props = $props();

  const activeSeat = $derived(extractActiveSeat(gameState));
  const isHumanTurn = $derived(activeSeat === HUMAN_SEAT);

  let goingAlone = $state(false);

  function extractActiveSeat(s: GameState): string | null {
    switch (s.phase) {
      case 'bidding-round-1':
      case 'bidding-round-2':
        return s.turn;
      case 'dealer-discard':
        return s.dealer;
      default:
        return null;
    }
  }

  function pass(): void {
    onAction({ type: 'pass', seat: HUMAN_SEAT });
  }

  function orderUp(): void {
    onAction({ type: 'orderUp', seat: HUMAN_SEAT, alone: goingAlone });
    goingAlone = false;
  }

  function callTrump(suit: Suit): void {
    onAction({ type: 'callTrump', seat: HUMAN_SEAT, suit, alone: goingAlone });
    goingAlone = false;
  }

  function discard(card: Card): void {
    onAction({ type: 'discardKitty', seat: HUMAN_SEAT, card });
  }

  function suitGlyph(suit: Suit): string {
    return suit === 'clubs'
      ? '\u2663'
      : suit === 'diamonds'
        ? '\u2666'
        : suit === 'hearts'
          ? '\u2665'
          : '\u2660';
  }
</script>

<section class="bidding" aria-labelledby="bidding-heading">
  <h3 id="bidding-heading" class="sr-only">Bidding</h3>
  {#if gameState.phase === 'bidding-round-1'}
    {#if isHumanTurn}
      <h4>Bidding round 1</h4>
      <p>Order up the {gameState.turnedCard.rank} of {gameState.turnedCard.suit}?</p>
      <div class="controls">
        <button type="button" class="btn btn-secondary" onclick={pass}>Pass</button>
        <button type="button" class="btn btn-primary" onclick={orderUp}>Order up</button>
        {#if gameState.variants.allowGoingAlone}
          <Toggle
            value={goingAlone}
            label="Going alone"
            onchange={(next) => (goingAlone = next)}
          />
        {/if}
      </div>
    {:else}
      <p class="status">Waiting for {activeSeat} to bid (round 1)…</p>
    {/if}
  {:else if gameState.phase === 'bidding-round-2'}
    {#if isHumanTurn}
      {@const dealerStuck = gameState.variants.stickTheDealer && gameState.turn === gameState.dealer}
      <h4>Bidding round 2</h4>
      <p>Rejected suit: {gameState.rejectedSuit}{dealerStuck ? ' — you are stuck!' : ''}</p>
      <div class="controls">
        {#if !dealerStuck}
          <button type="button" class="btn btn-secondary" onclick={pass}>Pass</button>
        {/if}
        {#each ['clubs', 'diamonds', 'hearts', 'spades'] as suit (suit)}
          {#if suit !== gameState.rejectedSuit}
            <button
              type="button"
              class="btn btn-secondary suit-btn"
              class:is-suit-red={suit === 'hearts' || suit === 'diamonds'}
              onclick={() => callTrump(suit as Suit)}
            >
              Call <span class="suit-glyph">{suitGlyph(suit as Suit)}</span>
            </button>
          {/if}
        {/each}
        {#if gameState.variants.allowGoingAlone}
          <Toggle
            value={goingAlone}
            label="Going alone"
            onchange={(next) => (goingAlone = next)}
          />
        {/if}
      </div>
    {:else}
      <p class="status">Waiting for {activeSeat} to bid (round 2)…</p>
    {/if}
  {:else if gameState.phase === 'dealer-discard'}
    {#if isHumanTurn}
      <h4>Dealer discard</h4>
      <p>Pick one card to discard.</p>
      <ul class="discard-list">
        {#each gameState.hands[HUMAN_SEAT] as card (`${card.suit}-${card.rank}-${card.deckId ?? 0}`)}
          <li>
            <CardView {card} onclick={() => discard(card)} />
          </li>
        {/each}
      </ul>
    {:else}
      <p class="status">Waiting for {activeSeat} to discard…</p>
    {/if}
  {/if}
</section>

<style>
  .bidding {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background-color: var(--bg-surface-strong);
    border-radius: var(--radius-lg);
    color: var(--text-on-felt);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-panel);
  }
  h4 {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--text-on-felt);
    letter-spacing: 0.02em;
  }
  p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-on-felt);
  }
  .status {
    color: var(--text-muted);
    font-style: italic;
  }
  .controls {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
  }
  .discard-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
</style>
