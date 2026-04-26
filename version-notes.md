# Version Upgrade Notes

A living document tracking "when we upgrade to version X, do Y." Any agent that discovers a version-dependent improvement must add a checkbox item here rather than implementing it on a non-current version.

See `skills/version-awareness.md` for the policy.

---

## Svelte

### When upgrading from Svelte 5.x to 6.x (future)
- [ ] Review breaking changes in 6.0 release notes
- [ ] Audit any remaining store usage and migrate to runes (should be minimal already)
- [ ] Re-run `svelte-check` and address any new warnings

## Vite

### When upgrading to a new Vite major
- [ ] Review release notes for changes to `base`, asset handling, or `import.meta.glob`
- [ ] Re-run the file:// smoke test (skills/vite-static-build.md)
- [ ] Re-verify `dist/` size budget

## TypeScript

### When upgrading to TS 6.x (future)
- [ ] Review strictness changes
- [ ] Re-run `tsc --noEmit` and address new errors
- [ ] Adopt new utility types if helpful

## Dexie

### When upgrading to a new Dexie major
- [ ] Review migration semantics — some majors changed how `.upgrade` is invoked
- [ ] Add tests for cross-major migration paths
- [ ] Re-verify export/import round-trip on existing fixtures

## Vitest / Playwright

### When upgrading to a new Vitest major
- [ ] Re-run the full unit suite
- [ ] Update mocking APIs if changed

### When upgrading Playwright
- [ ] Re-record any visual regression baselines
- [ ] Verify `axe-core` plugin compatibility

## Browser support

### When dropping support for a browser version
- [ ] Update CLAUDE.md "Browser support" line
- [ ] Audit polyfills for removal
- [ ] Re-budget bundle size

---

## Initial Scaffold Reconciliation (2026-04-25)

`npm create vite@latest` resolved to current upstream majors. `version.json` was rewritten to match what was installed (Vite 8, TS 6, Vitest 4, fast-check 4, ESLint 10, Node 24). All installs reported zero vulnerabilities; build, check, and dev all verified working. No code changes were required for the bumps because the scaffold is brand new.

---

## Project Milestones (non-version)

Items that aren't tied to a dependency version but track planned work:

- [ ] Implement Hard difficulty (MCTS) — currently stubbed; ai-strategy-expert
- [ ] Add `screw the dealer` variant — game-rules-engine
- [ ] Add 5- and 7-point game variants — game-rules-engine
- [ ] Add joker-as-highest-trump variant — game-rules-engine
- [ ] Light-mode theme — css-expert + accessibility-expert
- [ ] Replay viewer for completed games — indexeddb-expert + svelte-component-architect

---

## Lockfile drift workaround

**Symptom:** CI fails with errors like `Missing: @emnapi/core@... from lock file` or `Missing: @emnapi/runtime@... from lock file` after a new dep is added locally with `npm install <pkg>`.

**Root cause:** `npm install` only resolves optional deps for the install-time platform (OS + arch). When a new dep is added on one platform, the lockfile loses entries for other platforms' optional WASM/native bindings (e.g., `@emnapi/core`, `@emnapi/runtime`, platform-specific Rollup/swc binaries). CI on a different platform then fails the `npm ci` integrity check.

**Fix:** `npm run lockfix` — wipes `node_modules` and `package-lock.json`, then runs a clean `npm install` so the lockfile re-resolves with all platform variants.

**When to run:** After every `npm install <pkg>`, before committing the lockfile change. Cheaper to run once locally than to chase CI failures.

---

## Card art workflow

- Source images live outside the repo at `/home/ticketscene/card_faces/cards/`
- `scripts/generate_card_art.py` produces PNG intermediates in `src/assets/cards/{faces,backs}/` (gitignored)
- `scripts/optimize_card_art.py` produces WebP under `src/assets/cards/optimized/` (committed)
- Run both via `npm run regenerate-art` whenever the source images change

---

## Single-file build (2026-04-25)

**Change:** Switched the production build from chunked output (`dist/index.html` + `dist/assets/*.js` + `dist/assets/*.css` + 59 WebPs) to a single self-contained `dist/index.html` via [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile).

**Why:** Firefox and stock Chrome refuse to load ES-module `<script type="module" src="./assets/index-XXX.js">` cross-origin under `file://` — every module fetch is blocked with `Cross-Origin Request Blocked` / `Module source URI is not allowed in this document`. Headless Chromium can be flagged with `--allow-file-access-from-files` (and the e2e suite was doing exactly that), but real users opening `dist/index.html` by double-click cannot pass flags. The chunked build therefore broke the project's USB-portability promise.

**Configuration** in `vite.config.ts`:
- `viteSingleFile()` plugin (build-only — dev mode unaffected)
- `build.cssCodeSplit: false`
- `build.assetsInlineLimit: 100_000_000` (inlines every WebP card)
- `build.rollupOptions.output.inlineDynamicImports: true`
- Preserved `base: './'`

**Result:**
- `dist/` contains exactly one file: `index.html` (~5.5 MB, was 4.3 MB across many files chunked)
- Loads cleanly under `file://` in stock Firefox/Chrome with zero flags
- `tests/e2e/file-protocol.spec.ts` no longer needs `--allow-file-access-from-files`
- All 142 vitest + 11 Playwright tests still pass

**Tradeoffs:**
- Larger single file, slightly slower initial parse on a cold cache
- Can't lazy-load — but the bundle is small and there's nothing to lazy-load anyway
- USB distribution simplified to "copy one file"

**Future:** if the bundle grows past ~10 MB (e.g., adding sounds, more card-back themes), revisit. Could either ship miniserve alongside (see skills/vite-static-build.md) or drop back to chunked + miniserve.
