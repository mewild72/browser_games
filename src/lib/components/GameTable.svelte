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
  function fakeFaceDown(n: number): readonly Card[] {
    const arr: Card[] = [];
    for (let i = 0; i < n; i++) {
      // Placeholder card content; CardView ignores rank/suit when faceDown=true.
      arr.push({ suit: 'spades', rank: '9' });
    }
    return arr;
  }
</script>

<div class="table" aria-label="Euchre table">
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

    <div class="center-area">
      {#if showKitty}
        <Kitty turnedCard={turnedCard} kitty={kitty} turnedFaceDown={turnedFaceDown} />
      {:else}
        <TrickArea plays={trickPlays} />
      {/if}
    </div>

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
</div>

<style>
  .table {
    color: var(--text-primary);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    grid-template-rows: auto auto auto auto auto;
    grid-template-areas:
      'score   score    score'
      'log     north    panel'
      'west    center   east'
      'log     south    panel'
      'log     log      panel';
    gap: var(--space-3, 1rem);
    max-inline-size: 80rem;
    margin-inline: auto;
    padding: var(--space-3, 1rem);
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
    min-block-size: 8rem;
  }
  .panel-area {
    grid-area: panel;
  }
  .log-area {
    grid-area: log;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
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
  }
</style>
