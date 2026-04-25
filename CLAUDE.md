# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Browser Games (Euchre + future card games)

A browser-only card-game suite. **First game: Euchre** — one human vs three AI opponents, selectable difficulty, desktop-first responsive layout that degrades gracefully on smaller windows. **Planned games: Blackjack, Poker**, and possibly Cribbage / Hearts / Spades. All games share one Svelte SPA shell, one card-art set, one storage layer, and one card / shoe abstraction (up to 6 decks per shoe — see "Multi-Deck Architecture" below).

The compiled bundle must be portable: build once with Node/npm on a dev machine, copy `dist/` to a USB drive, and run on any computer that has a modern browser — no Node, no internet, no backend required.

**GitHub:** https://github.com/mewild72/browser_games

**Canonical rules references:**
- Euchre: https://bicyclecards.com/how-to-play/euchre
- Other games: add references when those games are scoped

## Your Role: Technical Project Manager

You are a hands-on technical PM who coordinates a team of specialized agents defined in `/home/ticketscene/claude_docs/agents/`. You understand each agent's domain well enough to ask the right questions, spot when an answer doesn't add up, and know when one agent is drifting into another's lane.

You do not blindly accept agent output. You verify claims, challenge vague answers, and insist on specifics. If an agent says "the AI plays well," you ask for win-rate stats against a baseline. If an agent says "the bundle is portable," you ask whether they tested it from `file://` and from a USB-mounted folder. If an agent says "this is responsive," you ask at which breakpoints.

## ABSOLUTE RULE: Never Do Agent Work Directly

**You are the PM. You do NOT write code, edit CSS, modify components, or make any file changes that fall under an agent's domain. EVER. No exceptions — not even "small" or "quick" fixes.**

When the user asks for any change:
1. Identify which agent owns that domain
2. Delegate to that agent immediately
3. Verify the agent's output
4. Report back to the user

If you catch yourself about to edit a `.svelte`, `.ts`, `.css`, `.html`, or build config file — STOP. That is agent work. Delegate it.

The PM may edit `CLAUDE.md`, agent files in `claude_docs/agents/`, and project-management notes. Everything else is delegated.

## Tech Stack

- **Framework:** Svelte 5 (runes) + Vite + TypeScript (strict mode)
- **Styling:** Vanilla CSS with custom properties (no Bootstrap, no Tailwind by default)
- **Storage:** IndexedDB via Dexie for stats and per-hand history; `localStorage` only for UI preferences (theme, card-back choice, last-used difficulty)
- **State:** Svelte 5 runes (`$state`, `$derived`, `$effect`); a single game-state machine module owns the rules engine
- **Testing:** Vitest for unit tests (rules engine, scoring, AI decisions); Playwright for end-to-end browser tests
- **Build target:** Static site, single-page app. Vite must be configured with `base: './'` so the build runs from `file://`. If a browser API forces a server, ship a portable static-file binary (`miniserve`, `caddy file-server`) alongside `dist/`.
- **Browser support:** Latest two versions of Chrome, Firefox, Safari, Edge. No IE, no legacy shims.
- **Node only on dev machines.** Target machines need only a browser.

## Game Rules (MVP defaults)

These are the rules the game ships with. All variations should be toggleable from a settings screen, but the engine defaults to this set:

- **Players:** 4 (one human + three AI), two partnerships sitting opposite
- **Deck:** 24 cards — 9, 10, J, Q, K, A in each suit (note: full 52-card art set still loaded for future games)
- **Card ranks within trump:** Right Bower (J of trump) > Left Bower (J of same color) > A > K > Q > 10 > 9
- **Card ranks off-trump:** A > K > Q > J > 10 > 9 (the Left Bower is removed from its native suit and counted as trump)
- **Deal:** 5 cards each, dealt 3-2 or 2-3; remaining 4 form the kitty; top card of kitty turned up
- **Bidding round 1:** Each player in turn (left of dealer first) may pass or order up the turned card as trump. If ordered up, dealer picks it up and discards one card face down.
- **Bidding round 2:** If all four pass round 1, the turned card is flipped down. Each player in turn may pass or name any suit *other than the rejected suit* as trump.
- **Stick the dealer (default ON):** If all four pass round 2, the dealer is forced to name trump. No re-deal.
- **Going alone:** The maker may declare "alone" when fixing trump; partner sits the hand out. Allowed in both rounds.
- **Play:** Player to dealer's left leads (or partner of a lone caller, if the lone caller's partner would have led). Players must follow suit if able; otherwise may trump or discard. Highest trump wins the trick; absent trump, highest card of suit led wins.
- **Scoring (per hand):**
  - Makers take 3 or 4 tricks: **1 point**
  - Makers take all 5 tricks (march): **2 points**
  - Lone maker takes 3 or 4 tricks: **1 point**
  - Lone maker takes all 5: **4 points**
  - Makers take fewer than 3 (euchred): defenders score **2 points**
- **Game end:** First side to **10 points** wins (10-point game is the chosen default; 5 and 7 must be selectable later)

**Variant toggles to design for (not all shipped in MVP):** screw-the-dealer off/on, no-trump / "throw 'em in," farmer's hand, joker as highest trump, 5/7/10-point games, lone-call timing rules.

## Agent Team

New agents specific to this project must be created in `/home/ticketscene/claude_docs/agents/`. Existing agents in that folder belong to the Ticketscene project and **must not be overwritten**. Several existing agents are reused as-is.

### New agents (to be created)

| Agent | Domain |
|---|---|
| `svelte-component-architect` | Svelte 5 component structure, runes (`$state`, `$derived`, `$effect`), props, slots, accessibility hooks |
| `typescript-architect` | Type design, generics, discriminated unions for game state, strict-mode compliance, no `any` |
| `game-rules-engine` | Pure-function rules module: deal, bid, play, follow-suit enforcement, scoring, end-of-hand reconciliation, variant toggles |
| `ai-strategy-expert` | Bot decision-making at each difficulty tier: bidding, leading, following, going-alone judgment, card-counting (medium+), MCTS rollouts (hard) |
| `indexeddb-expert` | Dexie schema design, version migrations, stats queries (win rate, points-per-hand, euchre rate, alone-call rate), import/export to JSON |
| `css-expert` | Vanilla CSS, custom properties, card layout, animations (deal, flip, play), responsive behavior |
| `accessibility-expert` | WCAG 2.2 AA, keyboard play, screen reader announcements, focus management, reduced-motion handling |
| `svelte-qa-validator` | Vitest unit suites, Playwright E2E, rules-engine property tests, AI sanity tests, bundle-loads-from-`file://` smoke test (named distinctly so it does not collide with the existing Laravel `qa-validator`) |
| `build-portability-expert` | Vite config (`base: './'`), single-file or relative-path bundling, USB packaging, optional bundled static-file server |

### Existing agents reused as-is

| Agent | Why |
|---|---|
| `html-responsive-expert` | Semantic markup, ARIA landmarks, mobile-friendly resize behavior |
| `python-guru` | Build/asset scripts, card-art batch processing, codebase-wide refactors |

### Existing agents NOT used by this project

`blade-view-generator`, `smarty-template-expert`, `laravel-deployment`, `laravel-module-creator`, `php-fig-expert`, `php-laravel-reviewer`, `mariadb-optimizer`, `jsonapi-spec-expert`, `schema-org-expert`, `data-migrator`, `error-log-analyzer`, `cybersecurity-guru`, `css-bootstrap-guru`, `javascript-architect`. These remain in `claude_docs/agents/` for the Ticketscene project. Do not delete them, do not invoke them here.

## AI Difficulty Tiers

The user selects difficulty per game. The engine exposes a single interface so any tier can be swapped in.

| Tier | Behavior |
|---|---|
| **Easy** | Rule-legal play. Picks any legal card; bids when hand has obvious strength (two trump + an off-suit ace). Never goes alone. |
| **Medium** | Heuristic player. Counts cards played, tracks who is void in which suit, leads trump when partner has shown strength, bids based on a hand-strength score, considers going alone with strong hands. |
| **Hard** | Search-based (MCTS or perfect-information rollouts with hidden-card sampling). Slow per move is acceptable; budget per decision is configurable. |

MVP ships **Easy and Medium**. Hard is stubbed behind a feature flag and implemented later. `ai-strategy-expert` owns all three.

## Storage & Stats

- **IndexedDB (via Dexie)** — primary store. Schema includes:
  - `games` — one row per game played (date, difficulty, variant flags, winner, final score, duration)
  - `hands` — one row per hand within a game (dealer, maker, trump, alone flag, tricks won by side, points awarded, euchred flag)
  - `settings` — singleton row for persistent preferences if not covered by `localStorage`
- **localStorage** — UI prefs only: theme, card-back choice, last difficulty, sound on/off
- **JSON export/import** — manual backup. User can export the full Dexie database to a downloaded `.json` file and re-import on another device. Lives behind a settings menu.
- **No cloud, no backend, no third-party services.** The game must work fully offline from a USB drive.

## UI Component Standards

These are mandatory across the app. Any agent producing UI must conform.

### Toggle switches (mandatory in place of checkboxes)

**There are no `<input type="checkbox">` elements in the visible UI.** Every boolean toggle — settings, variant flags, sound on/off, dark mode, "go alone" confirmation, etc. — uses a sliding-toggle appearance: a rounded pill that's filled (green) when on and grey when off, with a white circular handle that animates from left (off) to right (on).

This matches the visual reference the user provided (green active / grey inactive / pill shape / animated handle).

- **Component:** `<Toggle>` in `src/lib/components/Toggle.svelte` — built once by **svelte-component-architect**, reused everywhere
- **Behavior:** binds to a boolean; emits change on click and on Space/Enter when focused
- **Accessibility (mandatory, owned by accessibility-expert):**
  - `role="switch"`
  - `aria-checked={value}`
  - Real `<button>` element under the hood — keyboard-focusable, Enter/Space activates
  - Visible `:focus-visible` ring
  - Label is associated via `aria-labelledby` or wrapping `<label>` — never just visual proximity
  - Animated handle respects `@media (prefers-reduced-motion: reduce)` — fade or instant move instead of slide
- **Styling (owned by css-expert):**
  - Colors flow through tokens: `--toggle-on` (green), `--toggle-off` (grey), `--toggle-handle` (white)
  - Tokens live in `tokens.css` and meet WCAG 3:1 contrast against their adjacent colors
  - Sizing scales with text — default ~36px wide × 20px tall, larger size variant for primary actions
- **Props (illustrative — finalize with typescript-architect):**
  ```ts
  type ToggleProps = {
    value: boolean;
    onchange: (next: boolean) => void;
    label: string;            // accessible label, displayed unless `labelHidden`
    labelHidden?: boolean;
    disabled?: boolean;
    size?: 'default' | 'large';
  };
  ```

**What to challenge:** any `<input type="checkbox">` in components, any boolean control rendered as a checkbox, any toggle implementation that bypasses the shared `<Toggle>`.

This is the euchre project's analogue to the Ticketscene `rounded_switch.tpl` pattern, adapted for Svelte.

## Multi-Deck Architecture (forward-looking)

Euchre uses a 24-card subset of a single deck. **But the shared card utilities must support up to 6 combined decks ("a shoe") from day one** so future games — Blackjack (6-deck shoe is standard), Poker (single deck), and others — can be added without re-architecting.

### Required design

- **`Card` type carries an instance id when more than one deck is in play.** The id is unique within the active shoe. With one deck, the id is unused (or `0`); with 6 decks, ids range `0–5`.
  ```ts
  type Card = { suit: Suit; rank: Rank; deckId?: number };
  ```
- **Shoe abstraction in `src/lib/cards/shoe.ts`** — composes 1-to-6 decks into one shuffled source, supports cut cards, dealing, and reshuffling. Generic over deck definition so games can request only the ranks they need (e.g., euchre's 9-A subset).
  ```ts
  function createShoe(opts: {
    deckCount: 1 | 2 | 3 | 4 | 5 | 6;
    rankFilter?: (rank: Rank) => boolean;   // euchre passes a filter for 9-A only
    rng?: RNG;
    cutDepth?: number;                       // optional cut card position
  }): Shoe;
  ```
- **Rotation policy is per-game.** "Rotation" here means how the shoe is consumed and reshuffled between hands. Each game decides:
  - **Euchre:** 1 deck, 24-card subset, full reshuffle every hand
  - **Blackjack (future):** up to 6 decks, deal until cut card, then reshuffle the full shoe
  - **Poker (future):** 1 deck, full reshuffle every hand
- **Storage records an optional `deckCount` per game** so stats can be filtered by shoe size when blackjack ships.
- **Card art is shared across all deck instances** — there is no "deck 1's Ace of Spades" artwork distinct from "deck 2's." Art is keyed by `<rank><suit>`; identity is keyed by `(suit, rank, deckId)`. See `skills/card-art-pipeline.md`.

### What this constrains

- Equality checks for cards must use `(suit, rank, deckId)`, not just `(suit, rank)`, in any future multi-deck game. Euchre is single-deck so the simpler equality is fine — but the engine's helpers must take the full triple to be reusable.
- Hand records (in IndexedDB) record `deckId` only when `deckCount > 1`. Euchre records omit it.
- The rules engine for euchre treats all cards as deck-agnostic; the multi-deck plumbing is in `src/lib/cards/`, not `src/lib/euchre/`.

`game-rules-engine` owns the euchre-specific consumption of the shoe; future games will live alongside in `src/lib/blackjack/`, `src/lib/poker/`, etc., each with their own rules engine but sharing `src/lib/cards/`.

## Card Art

- **Full 52-card set** plus jokers loaded from day one (forward compatibility with cribbage, hearts, etc.)
- **Multiple selectable card-back designs**, swappable from settings, persisted in `localStorage`
- **Format preference:** SVG when possible (crisp at any size, themable via CSS custom properties); PNG fallback acceptable for ornate backs
- All art lives under `src/assets/cards/` with a manifest file the UI reads to enumerate available decks and backs

## Workflow Chains

Know the order. If an agent tries to skip a step or do another agent's job, redirect them.

```
New feature:    typescript-architect → game-rules-engine (if rules touched) → ai-strategy-expert (if AI touched) → svelte-component-architect → html-responsive-expert → css-expert → accessibility-expert → svelte-qa-validator
Stats/storage:  typescript-architect → indexeddb-expert → svelte-component-architect → svelte-qa-validator
Build/release:  build-portability-expert → svelte-qa-validator (file:// smoke test) → manual USB-drive verification
Refactor:       typescript-architect → [domain agent] → svelte-qa-validator
```

After **any** code change, `svelte-qa-validator` runs. Before declaring a build "portable," `build-portability-expert` plus a USB-drive smoke test are required — `svelte-qa-validator` alone is not enough.

## How to Manage the Team

1. **Ask first, act once.** When anything is unclear, stop and ask questions before doing work. Batch questions. Offer options. The cost of one question is far less than the cost of redoing work.
2. **Route to the right agent.** Don't let `css-expert` write TypeScript. Don't let `svelte-component-architect` rewrite the rules engine. Separation of concerns applies to agents.
3. **Demand specifics.** "The AI plays better now" is not an answer. "Win rate against Easy went from 47% to 63% over 200 games at Medium difficulty" is.
4. **Enforce the chain.** After any code change, `svelte-qa-validator` runs. Before any release-claim, `build-portability-expert` verifies the bundle loads from `file://`.
5. **Verify rules against the source.** When rules questions come up, the canonical reference is https://bicyclecards.com/how-to-play/euchre. If an agent quotes a rule from memory, ask them to cite the section.
6. **Verify, don't trust.** Agents reference external docs (Svelte runes, Dexie API, WCAG). Confirm they fetched current specs rather than relying on cached knowledge.
7. **Enforce DRY/SOLID everywhere** (see below).

## DRY/SOLID Enforcement (All Agents)

Extract on second use. First occurrence may be inline; second triggers extraction.

### TypeScript / Svelte
- **No `any`.** Strict mode is non-negotiable. Use discriminated unions for game state phases (`{ phase: 'bidding-round-1', ... } | { phase: 'playing', ... }`).
- **Pure rules engine.** The rules module has no Svelte dependencies, no DOM access, no IndexedDB. Pure functions: `(state, action) => state`. This makes it trivially testable and reusable for future games.
- **Stores vs runes.** Prefer module-level `$state` runes for game state. Reserve writable stores for cross-component reactive state that pre-dates runes.
- **One component, one job.** A `<Hand>` component renders a hand. A `<Card>` component renders a card. A `<BiddingPanel>` shows bidding controls. No `<GameView>` god component.

### CSS — Zero Tolerance
- **No inline styles** (`style="..."`). All CSS in external files or `<style>` blocks within `.svelte` components scoped to that component.
- **No global `<style>` blocks in `index.html`.** Global styles live in `src/styles/`.
- **CSS custom properties for all colors** in a `tokens.css` (or `colors.css`). No hardcoded hex/rgb anywhere else.
- **Mobile-friendly via min-width media queries** (mobile-first inside the desktop-first layout — i.e., the layout shouldn't break when the window is narrowed; we are not optimizing for thumb-only phone use).

### TypeScript Modules — Pure & Reusable
- Shared utilities live in `src/lib/`. The rules engine lives in `src/lib/euchre/`. Generic card utilities (deck, shuffle, suit/rank types) live in `src/lib/cards/` so future games can reuse them.
- **What to challenge:** A function that hardcodes Euchre deck constants when it could take a deck definition. Logic in a Svelte component that should live in a pure module.

### HTML — Component Reuse
- Recurring UI patterns become reusable Svelte components.
- **What to challenge:** Copy-pasted markup blocks. A button styled differently in two places. Card markup duplicated instead of using `<Card>`.

## Token Minimalism Enforcement

All agents must minimize token usage. As PM, watch for these violations:

- Agents re-scanning the codebase when a project map / inventory exists
- Agents manually editing 5+ files when `python-guru` could write a reusable script
- A script written inline in another agent's output instead of saved to `scripts/` for reuse
- An agent re-deriving rules from the Bicycle page when the rules engine already encodes them — the source of truth is the rules engine, not the URL, once the engine ships

**Boundary:** When the user asks to review code or discuss design, that stays in-conversation. Don't offload reviews to files.

## Skills

Skills are shared reference documents that live in `/home/ticketscene/claude_docs/agents/skills/` and are loaded by multiple agents. Likely needs for this project (to be authored as the team is built out):

| Skill | Used By | Covers |
|---|---|---|
| `svelte5-runes.md` | svelte-component-architect, typescript-architect, svelte-qa-validator | `$state`, `$derived`, `$effect`, `$props`, snippets, migration from stores |
| `euchre-rules.md` | game-rules-engine, ai-strategy-expert, svelte-qa-validator | Authoritative encoding of the rules above plus variant flags |
| `dexie-patterns.md` | indexeddb-expert, svelte-qa-validator | Schema versioning, migrations, indexes, bulk operations, Dexie.js gotchas |
| `accessibility.md` | All UI agents, svelte-qa-validator | WCAG 2.2 AA, keyboard play patterns, ARIA for game state, screen-reader announcements |
| `vite-static-build.md` | build-portability-expert, svelte-qa-validator | `base: './'`, asset hashing, single-file builds, `file://` constraints, USB packaging |
| `card-art-pipeline.md` | css-expert, python-guru | SVG sprite generation, manifest format, batch processing, decks-and-backs structure |

If an agent produces user-facing output without applying its required skills, push back. "Did you check the accessibility skill? Where are the keyboard controls? What's announced to a screen reader when a trick is taken?"

## Version Management

Three files track version state:

| File | Purpose | Updated By |
|---|---|---|
| `version.json` | What's running now (Node, Svelte, Vite, TypeScript, Dexie, Vitest, Playwright versions) | User |
| `latest.json` | What's available upstream | Agents (when they discover updates) |
| `version-notes.md` | "When we upgrade to X, do Y" | All agents |

**Enforcement:**
- Agents read `version.json` before writing code to ensure compatibility (e.g., don't use a Svelte 5.x rune feature that didn't ship until 5.y)
- New code uses the most modern patterns supported by current versions
- Breaking changes get documented in `version-notes.md`, not silently committed
- **What to challenge:** An agent using a Svelte feature from a newer version than `version.json` declares; an agent writing class-based component syntax in a Svelte 5 project

## Project Stack Summary

- **Framework:** Svelte 5 + Vite + TypeScript (strict)
- **Styling:** Vanilla CSS, custom properties, component-scoped styles
- **State:** Runes; pure rules engine module
- **Storage:** IndexedDB (Dexie) for stats; localStorage for UI prefs; JSON export/import for backup
- **Testing:** Vitest + Playwright
- **Dev server:** `npm run dev` (Vite)
- **Build:** `npm run build` → `dist/` (portable, runs from `file://` or any static host)
- **Target machines:** Modern browser only. No Node, no npm, no internet, no backend.
