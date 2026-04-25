# Browser Games

[![CI](https://github.com/mewild72/browser_games/actions/workflows/ci.yml/badge.svg)](https://github.com/mewild72/browser_games/actions/workflows/ci.yml)

A suite of browser-based card games that run entirely client-side — no server, no internet required at runtime. Build once, copy the `dist/` folder to a USB drive, and play anywhere with a modern browser.

**Status:** Early development. Euchre is the first game.

## Games

| Game | Status | Players |
|---|---|---|
| Euchre | In development (MVP) | 1 human + 3 AI |
| Blackjack | Planned | 1 human + dealer |
| Poker | Planned | TBD |

## Tech Stack

- [Svelte 5](https://svelte.dev/) (runes)
- [Vite 8](https://vite.dev/)
- [TypeScript 6](https://www.typescriptlang.org/) (strict)
- [Dexie 4](https://dexie.org/) for IndexedDB-backed game stats
- [Vitest 4](https://vitest.dev/) + [Playwright](https://playwright.dev/) for testing

The build is configured for `file://` portability — no server is required to play.

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173
```

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Produce a portable static build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run check` | Type-check via `svelte-check` |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |

## Distribution

To play on a machine without Node:

```bash
npm run build
# Copy the dist/ folder to a USB drive, another machine, anywhere.
# Open dist/index.html in any modern browser.
```

If `file://` ever proves insufficient (e.g., a future feature requires a server origin), a tiny portable static-file server like [miniserve](https://github.com/svenstaro/miniserve) can be shipped alongside `dist/`. See `CLAUDE.md` for details.

## Project Layout

```
src/
  lib/
    cards/          # Shared deck + shoe abstractions (1–6 decks)
    types/          # Shared TypeScript types
    components/     # Shared Svelte components (Card, Toggle, etc.)
    storage/        # Dexie schemas, stats queries, export/import
    euchre/         # Euchre rules engine (pure functions)
    ai/             # Bot decision-making, difficulty tiers
  styles/           # Design tokens, reset, layout, animations
  assets/cards/     # SVG card faces and selectable backs
tests/
  e2e/              # Playwright specs
  fixtures/         # Test data
  tournaments/      # Bot-vs-bot regression tournaments
scripts/            # Build / asset / utility scripts
```

## Architecture Highlights

- **Pure rules engines** per game in `src/lib/<game>/` — no DOM, no IO, no Svelte dependency. Components project the state, AI decides, storage persists; rules say what's legal.
- **Multi-deck shoe** in `src/lib/cards/` — euchre uses one deck (24-card subset); blackjack will use up to six.
- **IndexedDB stats** with JSON export/import so users can move their history between devices.
- **Selectable AI difficulty** per game — Easy / Medium / Hard, with the `<Bot>` interface decoupled from the rules engine.

For deeper architecture, agent collaboration model, and rule encodings, see `CLAUDE.md` and `version-notes.md`.

## Contributing

This is a personal project. Issues and pull requests welcome.

## License

[MIT](LICENSE) © 2026 mewild72
