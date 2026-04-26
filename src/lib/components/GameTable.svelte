<script lang="ts">
  /**
   * Game table layout. Composes the four seats, the kitty, the trick area,
   * the scoreboard, and the phase-conditional bidding/result panels.
   *
   * Layout uses CSS Grid with named template areas. css-expert will
   * redesign visual polish; this is the scaffold.
   *
   * Owner: svelte-component-architect
   */
  import type { Action, Card, GameState, Seat } from '@/lib/types';
  import { legalActions } from '@/lib/euchre';
  import {
    HUMAN_SEAT,
    actionLog,
    dispatchNextHand,
    dispatchUser,
    game,
    startNewGameSession,
  } from '@/lib/game/state.svelte';
  import ActionLog from './ActionLog.svelte';
  import BiddingPanel from './BiddingPanel.svelte';
  import GameCompletePanel from './GameCompletePanel.svelte';
  import HandCompletePanel from './HandCompletePanel.svelte';
  import Kitty from './Kitty.svelte';
  import PlayerSeat from './PlayerSeat.svelte';
  import ScoreBoard from './ScoreBoard.svelte';
  import TrickArea from './TrickArea.svelte';

  // Reactive accessors. We re-read game.value on every render, which is
  // why these are $derived rather than module-level constants.
  const state = $derived(game.value);

  const handsBySeat = $derived(extractHands(state));
  const turn = $derived(extractTurn(state));
  const dealer = $derived(state.dealer);
  const makerSeat = $derived(extractMakerSeat(state));
  const sittingOut = $derived(extractSittingOut(state));
  const trickPlays = $derived(extractTrickPlays(state));
  const turnedCard = $derived(extractTurnedCard(state));
  const kitty = $derived(extractKitty(state));
  const turnedFaceDown = $derived(state.phase === 'bidding-round-2');
  const showKitty = $derived(
    state.phase === 'bidding-round-1' || state.phase === 'bidding-round-2',
  );

  function extractHands(s: GameState): Record<Seat, readonly Card[]> {
    switch (s.phase) {
      case 'bidding-round-1':
      case 'bidding-round-2':
      case 'dealer-discard':
      case 'playing':
        return s.hands as Record<Seat, readonly Card[]>;
      default:
        return { north: [], east: [], south: [], west: [] };
    }
  }

  function extractTurn(s: GameState): Seat | null {
    switch (s.phase) {
      case 'bidding-round-1':
      case 'bidding-round-2':
      case 'playing':
        return s.turn;
      case 'dealer-discard':
        return s.dealer;
      default:
        return null;
    }
  }

  function extractMakerSeat(s: GameState): Seat | null {
    switch (s.phase) {
      case 'dealer-discard':
        return s.orderedUpBy;
      case 'playing':
        return s.makerSeat;
      default:
        return null;
    }
  }

  function extractSittingOut(s: GameState): Seat | null {
    return s.phase === 'playing' ? s.sittingOut : null;
  }

  function extractTrickPlays(s: GameState): readonly { seat: Seat; card: Card }[] {
    return s.phase === 'playing' ? s.currentTrick : [];
  }

  function extractTurnedCard(s: GameState): Card | undefined {
    if (s.phase === 'bidding-round-1' || s.phase === 'bidding-round-2') {
      return s.turnedCard;
    }
    return undefined;
  }

  function extractKitty(s: GameState): readonly Card[] {
    if (s.phase === 'bidding-round-1' || s.phase === 'bidding-round-2') {
      return s.kitty;
    }
    return [];
  }

  // Cards the human can play right now.
  const humanPlayable = $derived(legalHumanCards(state));

  function legalHumanCards(s: GameState): readonly Card[] {
    if (s.phase !== 'playing') return [];
    if (s.turn !== HUMAN_SEAT) return [];
    const out: Card[] = [];
    for (const a of legalActions(s, HUMAN_SEAT)) {
      if (a.type === 'playCard') out.push(a.card);
    }
    return out;
  }

  /**
   * When the human's turn begins (the playable list goes from empty to
   * non-empty) and no other element already has user focus inside the
   * hand, move focus to the first playable card. This satisfies WCAG
   * 2.4.3 (focus order) for keyboard-only players: they don't have to
   * Tab around the table to find their cards each trick.
   *
   * We refuse to grab focus when a modal is open (the focus belongs to
   * the modal) or when an interactive element on the page is already
   * focused inside the south-seat hand (the user already has a card
   * selected and may be deliberating).
   */
  // Plain `let` rather than $state — this is an internal guard against
  // re-focusing on every reactive tick; nothing else needs to react to it.
  let lastFocusedTrickIndex = -1;
  $effect(() => {
    // Re-evaluate whenever humanPlayable changes.
    const playable = humanPlayable;
    if (playable.length === 0) {
      lastFocusedTrickIndex = -1;
      return;
    }
    if (state.phase !== 'playing') return;
    // Use trick index as a one-shot guard so we focus once per trick the
    // human leads / responds to, not every reactive tick.
    const trickIndex = state.completedTricks.length;
    if (trickIndex === lastFocusedTrickIndex) return;
    queueMicrotask(() => {
      // Refuse if a modal dialog is open.
      if (document.querySelector('[role="dialog"]') !== null) return;
      // Refuse if focus already lives inside the south seat.
      const southSeat = document.querySelector('.south-seat');
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        southSeat !== null &&
        southSeat.contains(active)
      ) {
        return;
      }
      const firstCard = document.querySelector<HTMLButtonElement>(
        '.south-seat button.card.playable',
      );
      if (firstCard !== null) {
        firstCard.focus();
        lastFocusedTrickIndex = trickIndex;
      }
    });
  });

  function onPlayHumanCard(card: Card): void {
    const action: Action = { type: 'playCard', seat: HUMAN_SEAT, card };
    dispatchUser(action);
  }

  function onAction(action: Action): void {
    dispatchUser(action);
  }

  function onNextHand(): void {
    dispatchNextHand();
  }

  function onNewGame(): void {
    void startNewGameSession();
  }

  // For each non-human seat, build a face-down card list of the right length
  // so the visual count is accurate.
  //
  // Each placeholder card needs a unique (suit, rank, deckId) triple
  // because Hand.svelte keys its `{#each}` block by that triple — emitting
  // five identical placeholders triggers Svelte's `each_key_duplicate`
  // runtime error and blanks the page. Vary `deckId` per slot to keep
  // the keys distinct without affecting the visible face-down rendering
  // (CardView ignores suit/rank/deckId when faceDown=true).
  function fakeFaceDown(n: number): readonly Card[] {
    const arr: Card[] = [];
    for (let i = 0; i < n; i++) {
      arr.push({ suit: 'spades', rank: '9', deckId: i });
    }
    return arr;
  }
</script>

<!--
  Outer wrapper is <section aria-label="Euchre game">. We deliberately do
  NOT use role="application" here — that role tells assistive tech to suppress
  its virtual-cursor browse mode, and our game interactions are all standard
  button presses (no custom keyboard navigation grids). A labelled <section>
  preserves the screen-reader's normal reading mode while still grouping the
  game content as a discrete region.
-->
<section class="table" aria-label="Euchre game">
  <h2 class="sr-only">Game table</h2>
  <div class="grid">
    <div class="score-area">
      <ScoreBoard state={state} />
    </div>

    <div class="north-seat">
      <PlayerSeat
        seat="north"
        cards={fakeFaceDown(handsBySeat.north.length)}
        isActive={turn === 'north'}
        isDealer={dealer === 'north'}
        isMaker={makerSeat === 'north'}
        isSittingOut={sittingOut === 'north'}
      />
    </div>

    <div class="west-seat">
      <PlayerSeat
        seat="west"
        cards={fakeFaceDown(handsBySeat.west.length)}
        isActive={turn === 'west'}
        isDealer={dealer === 'west'}
        isMaker={makerSeat === 'west'}
        isSittingOut={sittingOut === 'west'}
      />
    </div>

    <section class="center-area" aria-label="Play area">
      {#if showKitty}
        <Kitty turnedCard={turnedCard} kitty={kitty} turnedFaceDown={turnedFaceDown} />
      {:else}
        <TrickArea plays={trickPlays} />
      {/if}
    </section>

    <div class="east-seat">
      <PlayerSeat
        seat="east"
        cards={fakeFaceDown(handsBySeat.east.length)}
        isActive={turn === 'east'}
        isDealer={dealer === 'east'}
        isMaker={makerSeat === 'east'}
        isSittingOut={sittingOut === 'east'}
      />
    </div>

    <div class="south-seat">
      <PlayerSeat
        seat="south"
        cards={handsBySeat.south}
        isHuman
        isActive={turn === 'south'}
        isDealer={dealer === 'south'}
        isMaker={makerSeat === 'south'}
        isSittingOut={sittingOut === 'south'}
        playable={humanPlayable}
        onPlay={onPlayHumanCard}
      />
    </div>

    <div class="panel-area">
      {#if state.phase === 'bidding-round-1' || state.phase === 'bidding-round-2' || state.phase === 'dealer-discard'}
        <BiddingPanel gameState={state} onAction={onAction} />
      {:else if state.phase === 'hand-complete'}
        <HandCompletePanel state={state} onNext={onNextHand} />
      {:else if state.phase === 'game-complete'}
        <GameCompletePanel state={state} onNewGame={onNewGame} />
      {/if}
    </div>

    <div class="log-area">
      <ActionLog entries={actionLog.value} />
    </div>
  </div>
</section>

<style>
  /*
    The table itself paints the felt — a layered radial gradient gives the
    classic "spotlight on green felt" look without an image asset. The
    inner felt is darker; the edge fades a touch lighter, making the
    middle of the table feel illuminated.
  */
  .table {
    position: relative;
    color: var(--text-on-felt);
    background:
      radial-gradient(
        ellipse at 50% 35%,
        var(--bg-felt-edge) 0%,
        var(--bg-felt) 45%,
        var(--bg-felt-deep) 100%
      );
    /* Subtle felt texture: a tiny pseudo-noise via repeating radial-gradient
       dots. Keeps the surface from looking flat without an image. */
    background-blend-mode: normal;
    min-block-size: 100%;
    padding: var(--space-5) var(--space-4);
  }
  .table::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(
      hsla(0, 0%, 100%, 0.025) 1px,
      transparent 1px
    );
    background-size: 4px 4px;
    mix-blend-mode: overlay;
  }

  .grid {
    position: relative;
    display: grid;
    /*
      Five rectangular columns: log | west | center | east | panel.
      Previous layout used a non-rectangular `log` area (rows 2,4,5 in
      column 1 with `west` interrupting at row 3) which CSS Grid
      silently rejects, allowing the log to render over the play / panel
      areas at common viewport widths and intercept pointer events.
      Each named area below now forms a true rectangle.
    */
    grid-template-columns:
      minmax(11rem, 0.85fr)
      minmax(0, 1fr)
      minmax(0, 2fr)
      minmax(0, 1fr)
      minmax(11rem, 0.85fr);
    grid-template-rows: auto auto auto auto;
    grid-template-areas:
      'score   score   score    score   score'
      'log     north   north    north   panel'
      'log     west    center   east    panel'
      'log     south   south    south   panel';
    gap: var(--space-4);
    max-inline-size: 80rem;
    margin-inline: auto;
  }
  .score-area {
    grid-area: score;
  }
  .north-seat {
    grid-area: north;
    display: flex;
    justify-content: center;
  }
  .south-seat {
    grid-area: south;
    display: flex;
    justify-content: center;
  }
  .west-seat {
    grid-area: west;
    display: flex;
    justify-content: flex-start;
    align-items: center;
  }
  .east-seat {
    grid-area: east;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .center-area {
    grid-area: center;
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 12rem;
    /* The center "well" — a subtle inset darkening to focus attention */
    border-radius: var(--radius-lg);
    background-color: hsla(140, 35%, 14%, 0.5);
    box-shadow:
      inset 0 2px 8px hsla(0, 0%, 0%, 0.35),
      inset 0 0 40px hsla(0, 0%, 0%, 0.25);
    padding: var(--space-4);
  }
  .panel-area {
    grid-area: panel;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .log-area {
    grid-area: log;
  }

  /* Tablet — keep horizontal seats but tighten gaps */
  @media (max-width: 1099px) {
    .table {
      padding: var(--space-4) var(--space-3);
    }
    .grid {
      gap: var(--space-3);
      /* Slightly narrower side rails so the center has more room. */
      grid-template-columns:
        minmax(10rem, 0.7fr)
        minmax(0, 1fr)
        minmax(0, 2fr)
        minmax(0, 1fr)
        minmax(10rem, 0.7fr);
    }
    .log-area {
      max-block-size: 28rem;
    }
  }

  /* Narrow — drop side seats and panels into a single column. */
  @media (max-width: 899px) {
    .grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto auto auto auto auto auto;
      grid-template-areas:
        'score'
        'north'
        'west'
        'center'
        'east'
        'south'
        'panel'
        'log';
    }
    .west-seat,
    .east-seat {
      justify-content: center;
    }
    .center-area {
      min-block-size: 9rem;
    }
    .log-area {
      max-block-size: 14rem;
    }
  }

  @media (max-width: 699px) {
    .table {
      padding: var(--space-3) var(--space-2);
    }
    .log-area {
      max-block-size: 10rem;
    }
  }
</style>
