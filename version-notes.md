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
