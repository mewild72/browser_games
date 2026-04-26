/**
 * Card-art asset map.
 *
 * Bundles every optimized WebP face / back from `src/assets/cards/optimized/`
 * via Vite's `import.meta.glob` (eager). Each glob match becomes a hashed
 * URL emitted under `dist/assets/` at build time, fully relative-path
 * compatible with `file://`.
 *
 * Public surface:
 *  - `faceUrls`         — keyed by `${rank}${suit}` (e.g. `"AC"`, `"10S"`,
 *                         `"JK1"` for jokers)
 *  - `backUrls`         — keyed by back id (e.g. `"classic-blue"`)
 *  - `cardUrl(card)`    — given a `Card`, return the matching face URL or
 *                         `undefined` if no asset is available
 *  - `cardBacks`        — manifest-driven list of backs with labels and
 *                         resolved URLs, ready for the picker UI
 *
 * Notes on the keying scheme:
 *  - Suit is encoded as a single uppercase letter: C/D/H/S
 *  - Rank is `A`, `2`-`10`, `J`, `Q`, `K` (no zero-padding for `10`)
 *  - Jokers are filename-only (`JK1.webp` / `JK2.webp`); they are not
 *    expressible via the `Card` type today and are exposed only through
 *    `faceUrls` for future use
 *
 * Filtering:
 *  - If the manifest claims a back id that has no corresponding WebP in
 *    `backs/` (e.g. removed without regenerating), it is skipped with a
 *    `console.warn` rather than throwing — UI degradation is preferable
 *    to a hard failure on a missing optional asset.
 *
 * Owner: svelte-component-architect
 */

import type { Card, Suit } from '@/lib/types';
import manifestJson from '@/assets/cards/optimized/manifest.json';

/* ------------------------------------------------------------------ */
/* Manifest typing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Schema-versioned manifest written by `scripts/generate_card_manifest.py`.
 *
 * `schemaVersion` is checked at module load so a future bump that breaks
 * compatibility produces a clear console error instead of silent drift.
 */
export type CardManifest = {
  readonly schemaVersion: number;
  readonly faces: Readonly<
    Record<
      string,
      {
        readonly label: string;
        readonly format: string;
        readonly path: string;
      }
    >
  >;
  readonly backs: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly path: string;
  }>;
};

const manifest: CardManifest = manifestJson as CardManifest;

/** Schema version this module was written against. */
const SUPPORTED_SCHEMA_VERSION = 1;

if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
  // eslint-disable-next-line no-console
  console.warn(
    `[card-art] manifest schemaVersion ${manifest.schemaVersion} does not match expected ${SUPPORTED_SCHEMA_VERSION}; proceeding anyway`,
  );
}

/* ------------------------------------------------------------------ */
/* Bundled URL maps                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a `{ basename: url }` map from a glob result by stripping the
 * directory path and the `.webp` extension. `import.meta.glob`'s `eager`
 * + `import: 'default'` settings make each value the resolved asset URL
 * (a string after Vite processes the import).
 */
function buildUrlMap(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fullPath in modules) {
    // Vite normalises paths to forward slashes on every platform.
    const file = fullPath.split('/').pop();
    if (file === undefined) continue;
    const name = file.replace(/\.webp$/i, '');
    const url = modules[fullPath];
    if (url === undefined) continue;
    out[name] = url;
  }
  return out;
}

const faceModules = import.meta.glob<string>(
  '/src/assets/cards/optimized/faces/*.webp',
  { eager: true, import: 'default' },
);

const backModules = import.meta.glob<string>(
  '/src/assets/cards/optimized/backs/*.webp',
  { eager: true, import: 'default' },
);

/**
 * Map of face URLs keyed by `${rank}${suitLetter}` (e.g. `AC`, `10S`).
 * Joker entries (`JK1`, `JK2`) appear when the bundle includes them.
 */
export const faceUrls: Readonly<Record<string, string>> = Object.freeze(
  buildUrlMap(faceModules),
);

/**
 * Map of back URLs keyed by descriptor id (e.g. `classic-blue`).
 */
export const backUrls: Readonly<Record<string, string>> = Object.freeze(
  buildUrlMap(backModules),
);

/* ------------------------------------------------------------------ */
/* Card → key helper                                                  */
/* ------------------------------------------------------------------ */

/**
 * First-letter uppercase for suit names, matching the canonical naming
 * scheme defined in `agents/skills/card-art-pipeline.md`.
 */
const suitLetterOf: Readonly<Record<Suit, string>> = Object.freeze({
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
});

/**
 * Build the asset-map key for a `Card` (e.g. `{rank: '10', suit: 'spades'}`
 * → `"10S"`). The rank is left as-is so `10` is not zero-padded; the suit
 * collapses to its uppercase first letter.
 */
export function keyForCard(card: Card): string {
  return `${card.rank}${suitLetterOf[card.suit]}`;
}

/**
 * Resolve a `Card` to its bundled face-art URL, or `undefined` if no
 * asset exists for it. Components fall back to text rendering when
 * `undefined` is returned.
 */
export function cardUrl(card: Card): string | undefined {
  return faceUrls[keyForCard(card)];
}

/* ------------------------------------------------------------------ */
/* Card-back picker model                                             */
/* ------------------------------------------------------------------ */

/**
 * One pickable card-back option. `url` is the bundled, hashed asset URL.
 */
export type CardBackOption = {
  readonly id: string;
  readonly label: string;
  readonly url: string;
};

/**
 * List of card backs ready for the settings picker. Backs claimed by the
 * manifest but missing from `backUrls` are dropped with a warning so the
 * picker never shows a broken option.
 */
export const cardBacks: readonly CardBackOption[] = Object.freeze(
  manifest.backs
    .map((entry): CardBackOption | undefined => {
      const url = backUrls[entry.id];
      if (url === undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          `[card-art] manifest references back "${entry.id}" but no WebP found; omitting from picker`,
        );
        return undefined;
      }
      return { id: entry.id, label: entry.label, url };
    })
    .filter((entry): entry is CardBackOption => entry !== undefined),
);

/**
 * Default card-back id used when no preference is stored. Picked from the
 * first manifest entry so the default tracks the manifest rather than a
 * hardcoded string. Falls back to `'classic-blue'` if the manifest is empty.
 */
export const DEFAULT_CARD_BACK_ID: string =
  cardBacks[0]?.id ?? 'classic-blue';
