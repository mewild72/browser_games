# Card Art — AI Image-Gen Prompt Guide

This doc helps you generate ornate playing cards for `browser_games` using an AI image tool (Midjourney, DALL-E, Flux, Stable Diffusion, etc.) that match the project's visual references.

## Reference Style

Visual anchors (from project references):

- **Zentangle / mandala suit symbols** — intricate line work, floral and peacock motifs, mirror symmetry
- **Traditional poker card layout** — white/cream background, rounded corners, large central artwork, indices (rank + small suit) in opposite corners
- **Royal court cards** — double-ended (mirror image, top and bottom halves), red/gold/black palette, ornate regalia

## What You Need to Generate

You only need ~16–22 external pieces — pips and aces are built programmatically by `css-expert` from the suit symbols.

| Asset | Count | Notes |
|---|---|---|
| Ornate suit symbols (♠ ♥ ♦ ♣) | 4 | Used for pip cards 2–10 and Aces |
| Court cards (J, Q, K × 4 suits) | 12 | Each unique, consistent style across all 12 |
| Card backs | 2–4 | Different designs the user can pick from |
| Jokers (red, black) | 0 or 2 | Optional — euchre doesn't use them; future games might |

## Technical Requirements

| Field | Value |
|---|---|
| **Output dimensions** | 600 × 840 px (5:7 aspect — standard poker) for full cards; 600 × 600 px for suit symbols |
| **Format** | PNG with transparent background preferred; SVG ideal for suits if your tool supports vector |
| **DPI** | 300 if printing matters; otherwise 72 is fine for screen |
| **Color space** | sRGB |
| **Bleed / safe area** | Keep important detail at least 40 px in from each edge |
| **File naming** | See `skills/card-art-pipeline.md` — `JS.svg` (Jack of Spades), `KH.png` (King of Hearts), `classic-blue.svg` (back) |

If your tool exports JPG with backgrounds, that's fine — `python-guru` will provide a normalize script that trims/resizes/transparentizes.

---

## Style Anchor Block (paste into every prompt)

Build a consistent deck by reusing this exact phrasing as a suffix to every prompt:

```
Style anchors: ornate zentangle line art, intricate floral and peacock
mandala patterns, hand-drawn ink illustration, traditional playing card
aesthetic, white cream background, deep red and rich black palette with
gold accents on royal cards only, mirror-symmetric composition,
high-contrast, crisp linework, no photorealism, no shading gradients,
no shadows, flat color fills.
```

Reusing the same phrasing across cards is what produces a cohesive deck.

---

## Per-Asset Prompts

### 1. Suit Symbols (4 — generate first)

Generate these first because the pip cards and aces will be built from them. Lock the style here, then reference these images when generating courts.

**Spade (black):**
```
A single ornate playing-card spade symbol, centered on plain white
background, intricate zentangle line art with peacock-feather details
filling the body of the spade, mirror-symmetric, crisp black ink lines,
no shading, no shadow, no card frame, no rank indices, just the spade
shape. {Style anchors}
```

**Club (black):**
```
A single ornate playing-card club symbol, centered on plain white
background, intricate zentangle line art with eye-of-peacock motifs and
flowing leaf patterns filling the trefoil body, mirror-symmetric, crisp
black ink lines, no shading, no shadow, no card frame, no rank indices,
just the club shape. {Style anchors}
```

**Heart (red):**
```
A single ornate playing-card heart symbol, centered on plain white
background, intricate zentangle line art with floral mandala filling
the heart body, mirror-symmetric, crisp deep-red ink lines on white,
no shading, no shadow, no card frame, no rank indices, just the heart
shape. {Style anchors}
```

**Diamond (red):**
```
A single ornate playing-card diamond symbol, centered on plain white
background, intricate zentangle line art with crown and floral motifs
filling the diamond body, mirror-symmetric, crisp deep-red ink lines on
white, no shading, no shadow, no card frame, no rank indices, just the
diamond shape. {Style anchors}
```

### 2. Court Cards (12)

Generate after suits are locked. **Reference the suit images** in your tool (image-prompt feature) so the suit symbol on the court card matches the generated suit.

For each of {Jack, Queen, King} × {Spades, Hearts, Diamonds, Clubs}:

```
Ornate {RANK} of {SUIT} playing card, double-ended mirror-symmetric
composition (top half mirrors bottom half along horizontal center
line), {RANK_DESCRIPTION}, ornate {SUIT_COLOR} robes with gold
accents, holding {OBJECT}, white cream card background with subtle
gold detailing in the borders, the {SUIT_NAME} suit symbol in the
top-left and bottom-right corners with the letter "{RANK_INITIAL}"
above each, traditional poker card layout. {Style anchors}
```

Filling the templates:

| RANK | RANK_INITIAL | RANK_DESCRIPTION | OBJECT |
|---|---|---|---|
| Jack | J | a young noble courtier with shoulder-length hair, slight beard | a sword, banner, or scroll |
| Queen | Q | a regal woman with elaborate crown and jeweled necklace | a flower (specifically: spade=tulip, heart=rose, diamond=lily, club=orchid) |
| King | K | a bearded monarch with grand crown, shoulder-length hair | a sword (spade), scepter (heart), orb (diamond), or staff (club) |

| SUIT | SUIT_COLOR | SUIT_NAME |
|---|---|---|
| Spades | deep red and black | spade |
| Hearts | crimson and gold | heart |
| Diamonds | royal red and gold | diamond |
| Clubs | dark red and black | club |

**Tip:** generate all four kings first (most distinctive), then all four queens, then all four jacks — that way you can iterate prompt wording within each rank for consistency.

### 3. Card Backs (2–4)

Generate one or several to give the user choice in settings:

**Classic Blue:**
```
Playing card back design, full bleed pattern filling the entire card
face, deep navy blue background, ornate gold filigree border with
fleur-de-lis corners, intricate zentangle medallion in the center
showing a stylized peacock with mandala plumage, mirror-symmetric
composition, gold and white linework on navy. {Style anchors minus
the "white cream background" line}
```

**Classic Red:**
```
Playing card back design, full bleed pattern filling the entire card
face, deep crimson red background, ornate gold filigree border with
fleur-de-lis corners, intricate zentangle medallion in the center
showing a stylized rose with mandala petals, mirror-symmetric
composition, gold and white linework on crimson. {Style anchors minus
the "white cream background" line}
```

**Geometric:**
```
Playing card back design, full bleed pattern filling the entire card
face, deep emerald green background, intricate Islamic-style
geometric tessellation in gold, eight-pointed star at center, ornate
border with corner medallions, no figures, pure geometric pattern.
{Style anchors}
```

### 4. Jokers (Optional)

```
Ornate Joker playing card, mirror-symmetric double-ended layout, a
medieval court jester with cap-and-bells in {COLOR} robes and
diamond-pattern motley costume, holding a marotte (jester's stick),
tongue out, playful expression, {SUIT_COLOR} ink on white cream card
background, the word "JOKER" running diagonally in stylized lettering.
{Style anchors}
```

- Red joker: `COLOR = crimson`, `SUIT_COLOR = deep red`
- Black joker: `COLOR = midnight black`, `SUIT_COLOR = black`

---

## Consistency Tips

1. **Lock the style first.** Generate all 4 suits before starting on courts. If suits look great but inconsistent, regenerate until they match.
2. **Use image-prompt features** (Midjourney `--cref`, DALL-E reference images, Flux LoRA training, etc.) to pin the style across cards.
3. **Same seed when possible.** If your tool exposes seed control, use the same seed across the same rank (all Kings same seed, all Queens same seed) for consistency.
4. **Generate in batches of 4 (one per suit) for the same rank.** Easier to spot which one is the odd duck.
5. **Reject ruthlessly.** A deck is judged by its weakest card. Better to regenerate than ship inconsistencies.

## Evaluation Checklist (per card)

- [ ] Same line weight as other cards in the deck?
- [ ] Same color palette (no rogue colors)?
- [ ] No photorealism / shading gradients?
- [ ] Mirror-symmetric or appropriately asymmetric per rank?
- [ ] White or transparent background (not gradient, not patterned, unless it's a card back)?
- [ ] Correct suit symbol clearly visible in corners (for courts)?
- [ ] Indices readable at 80 px wide (the smallest the card will display)?

## After Generation — Hand-off to `python-guru`

Drop your raw exports into `src/assets/cards/raw/`. The `python-guru` agent will:

1. Trim whitespace and re-center
2. Resize to canonical dimensions (600 × 840 for cards, 600 × 600 for suit symbols)
3. Apply transparent background if the source has white
4. Optimize file size (svgo for SVG, oxipng for PNG)
5. Move into `faces/` or `backs/` with the correct filename
6. Regenerate `manifest.json`

Run: `python scripts/normalize_card_art.py --input src/assets/cards/raw/ --output src/assets/cards/`

(Script is created when you have art in hand — coordinate with the PM to delegate to `python-guru`.)

## Cost & Time

Rough budget guide:

- **Midjourney / DALL-E / Flux on a hosted service:** 30–60 generations × $0.05–$0.20 each = $2–$12 to land a usable deck (you'll regenerate cards you don't love)
- **Local Stable Diffusion / Flux:** time only; expect 1–3 hours of iteration to reach a cohesive deck
- **Time:** plan ~3–5 hours total — locking the style takes the most time; once locked, the rest goes fast

## When You're Done

Tell the PM: "card art is in `src/assets/cards/raw/`" and the PM will dispatch `python-guru` for normalization plus `css-expert` for the programmatic pip cards and integration.
