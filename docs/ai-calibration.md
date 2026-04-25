# AI Calibration

Self-play tournament results for the Easy and Medium bots. Updated whenever
the AI is tuned. Hard tier is currently a stub — IS-MCTS deferred.

## Methodology

- Headless tournament harness: `src/lib/ai/tournament.ts` (`runTournament`).
- Games run with the engine as a black box: `createGame` → loop
  `applyAction` until `game-complete`, advancing hands with
  `advanceToNextHand`.
- RNG: `seededRng(seed)` (mulberry32) supplied to both `createGame` and
  the bots. Same seed produces identical play.
- All bot moves verified against `legalActions` when `assertLegal: true`.

## Hand-strength formula (current)

`handStrength` (in `src/lib/ai/heuristics.ts`):

```
3.0 × right bowers
2.5 × left bowers
1.5 × other trump cards
1.0 × off-suit aces
0.6 × off-suit voids (excluding trump suit)
+0.5  if kitty top card is the right bower of the candidate trump AND we
      are the would-be maker (round-1 only)
+0.25 if kitty top card is any other trump card AND we are the would-be
      maker (round-1 only)
```

### Bidding thresholds

| Decision | Threshold | Notes |
|---|---|---|
| Round-1 order up — base | 7.0 | seats: dealer, dealer's left, dealer's partner |
| Round-1 order up — seat 3 (dealer's right) | 6.0 | lower because pass risks dealer's team picking up |
| Round-2 call | 6.5 | unless stuck (then -∞) |
| Stick-the-dealer call | -∞ | dealer must call something |
| Going alone (heuristic) | 11.0 | very high; dominant hands only |
| Going alone (canonical) | — | both bowers + ace of trump + trump count ≥ 4 |

Calibration constants live in `src/lib/ai/medium.ts`.

## Tournament result — 2026-04-25

**Setup:**
- Seed: `20260425`
- Games: `200`
- Seats: NS = Medium, EW = Easy

**Headline metrics:**

| Metric | Value |
|---|---|
| Medium win rate | **96.0 %** |
| Easy win rate | 4.0 % |
| Average hands per game | 10.04 |
| Euchre rate (per hand) | 32.2 % |
| Going-alone call rate (per hand) | 0.5 % |
| Going-alone success rate | 100.0 % (1/1) |

**Time budgets (median of 100 calls):**

| Bot | Phase | Median | Max |
|---|---|---|---|
| Easy | initial bid | 0.002 ms | 0.012 ms |
| Medium | playing | 0.003 ms | 0.028 ms |

Both well under their tier budgets (Easy < 50 ms, Medium < 200 ms).

## Notes & caveats

- The 96 % win rate vs Easy is a wide margin and indicates Medium has
  established the right baseline. A future Hard tier will be tuned
  against Medium with a similar gap goal.
- Going-alone is rare (0.5 %) because the canonical-strong condition
  (both bowers + trump ace + trump count ≥ 4 in a 5-card hand) is rare
  in random deals. The 100 % success rate on the single observation
  here is not statistically meaningful — re-evaluate with a larger
  sample once Hard ships.
- Easy never goes alone by design.
- The bots are stateless across calls; card-counting state (voids,
  played cards) is recomputed from `state.completedTricks` each
  decision. This makes them trivially testable and replay-deterministic.
