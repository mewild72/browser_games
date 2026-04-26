#!/usr/bin/env python3
"""Generate the 40 missing pip cards and normalize externally-generated card art
into the project's canonical layout under src/assets/cards/.

Source layout (input dir, default /home/ticketscene/card_faces/cards):
  - club.png, diamond.png, heart.png, spade.png      (suit symbols, ~square)
  - j-c.png ... k-s.png                              (12 court cards, full frame)
  - b-joker.png, r-joker.png                         (2 jokers, full frame)
  - bg-black.png, bg-blue.png, bg-green.png,
    bg-purple.png, bg-red.png                        (5 card backs, full frame)

Output layout (output dir, default browser_games/src/assets/cards):
  faces/
    AC.png 2C.png ... 10C.png      (40 generated pip cards)
    AD.png ... 10D.png
    AH.png ... 10H.png
    AS.png ... 10S.png
    JC.png QC.png KC.png ...        (12 normalized court cards)
    JK1.png JK2.png                 (2 jokers; black=JK1, red=JK2)
  backs/
    classic-blue.png
    classic-red.png
    forest-green.png
    royal-purple.png
    midnight-black.png
  suits/
    club.png diamond.png heart.png spade.png   (standalone suit symbols
    on transparent background; used for the trump indicator and other UI)
  manifest.json

The court cards' dimensions (1054x1492) are treated as the canonical card
size. Pip cards are generated at the same dimensions to match. Cream
background (#F3EBE1) and rounded corners with a thin dark border mimic the
court card frame.

Usage:
  python scripts/generate_card_art.py [--source DIR] [--output DIR] [--dry-run]

Idempotent: re-running overwrites existing output. Errors loud — missing
source files cause an immediate failure naming the missing file.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write(
        "ERROR: Pillow is required. Install with `pip install Pillow` "
        "(or `pip install --break-system-packages Pillow` on system Python).\n"
    )
    sys.exit(1)


# --- Constants -------------------------------------------------------------

DEFAULT_SOURCE = Path("/home/ticketscene/card_faces/cards")
# Default output is relative to repo root (the parent of scripts/).
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "cards"

SUITS: List[Tuple[str, str, str]] = [
    # (suit_letter, source_filename_stem, color_label)
    ("C", "club", "black"),
    ("D", "diamond", "red"),
    ("H", "heart", "red"),
    ("S", "spade", "black"),
]

RANKS: List[str] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

COURTS: Dict[str, str] = {
    # output filename stem -> source filename stem
    "JC": "j-c", "JD": "j-d", "JH": "j-h", "JS": "j-s",
    "QC": "q-c", "QD": "q-d", "QH": "q-h", "QS": "q-s",
    "KC": "k-c", "KD": "k-d", "KH": "k-h", "KS": "k-s",
}

# Joker convention: black joker -> JK1, red joker -> JK2. Documented here so
# downstream code is unambiguous.
JOKERS: Dict[str, str] = {
    "JK1": "b-joker",  # black joker
    "JK2": "r-joker",  # red joker
}

BACKS: Dict[str, Tuple[str, str]] = {
    # output filename stem -> (source filename stem, label)
    "classic-blue":    ("bg-blue",   "Classic Blue"),
    "classic-red":     ("bg-red",    "Classic Red"),
    "forest-green":    ("bg-green",  "Forest Green"),
    "royal-purple":    ("bg-purple", "Royal Purple"),
    "midnight-black":  ("bg-black",  "Midnight Black"),
}

# Standalone suit-symbol output dimensions. Suits are 1:1 and the trump
# indicator may render at varied sizes — 600x600 gives plenty of headroom
# for sharp downscaling.
SUIT_SYMBOL_SIZE = 600

# Pip-card aesthetics. Tuned to match the court-card cream/black frame.
CARD_BG_COLOR = (243, 235, 225, 255)   # cream — matches court card body
CARD_BORDER_COLOR = (20, 20, 20, 255)  # dark, mimics court card edges
RED_COLOR = (170, 20, 20, 255)
BLACK_COLOR = (20, 20, 20, 255)

# Font preference order. First available wins.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


# --- Helpers ---------------------------------------------------------------

def find_font_path() -> Optional[str]:
    """Return the first available font path from FONT_CANDIDATES, or None."""
    for path in FONT_CANDIDATES:
        if Path(path).is_file():
            return path
    return None


def load_suit_image(source_dir: Path, suit_stem: str) -> Image.Image:
    """Load a suit image and convert white background to transparent.

    Returns an RGBA image cropped to the suit's bounding box (so it can be
    cleanly composited).
    """
    src_path = source_dir / f"{suit_stem}.png"
    if not src_path.is_file():
        raise FileNotFoundError(
            f"Missing required source suit image: {src_path}"
        )

    img = Image.open(src_path).convert("RGBA")
    # Punch out near-white pixels to alpha=0. Tolerance is generous because
    # JPEG-style compression artifacts may have shifted near-whites.
    pixels = img.load()
    w, h = img.size
    threshold = 235  # any channel below this means the pixel is part of the art
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)

    # Crop to bounding box of non-transparent pixels for cleaner placement.
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def make_card_canvas(width: int, height: int) -> Image.Image:
    """Create a cream-colored card canvas with rounded corners and a thin
    dark border (mimics the court-card frame).
    """
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    radius = max(8, int(min(width, height) * 0.05))
    border_width = max(2, int(min(width, height) * 0.004))  # ~6 px on 1054x1492

    # Filled rounded rect for the card body (cream).
    draw.rounded_rectangle(
        [(0, 0), (width - 1, height - 1)],
        radius=radius,
        fill=CARD_BG_COLOR,
        outline=CARD_BORDER_COLOR,
        width=border_width,
    )
    return canvas


def composite_suit(
    canvas: Image.Image,
    suit_img: Image.Image,
    cx: int,
    cy: int,
    target_h: int,
    rotate_180: bool = False,
) -> None:
    """Composite a suit image onto the canvas, scaled so its height equals
    target_h, centered at (cx, cy). Optionally rotated 180 degrees."""
    sw, sh = suit_img.size
    scale = target_h / sh
    new_w = max(1, int(sw * scale))
    new_h = max(1, int(sh * scale))
    resized = suit_img.resize((new_w, new_h), Image.LANCZOS)
    if rotate_180:
        resized = resized.rotate(180)
    x = cx - new_w // 2
    y = cy - new_h // 2
    canvas.alpha_composite(resized, dest=(x, y))


def render_index(
    canvas: Image.Image,
    rank: str,
    suit_img: Image.Image,
    color: Tuple[int, int, int, int],
    font_path: Optional[str],
    width: int,
    height: int,
) -> None:
    """Render the rank text + small suit glyph in the top-left corner and
    again rotated 180 degrees in the bottom-right corner."""
    # Build the index group on a small transparent layer, then paste twice.
    rank_h = int(height * 0.09)         # ~9% of card height for rank text
    glyph_h = int(height * 0.07)        # ~7% for the small suit glyph
    pad = int(height * 0.018)           # gap between text and glyph

    # Layer wide enough for any rank ("10" is widest).
    layer_w = int(width * 0.16)
    layer_h = rank_h + pad + glyph_h + 8
    layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)

    if font_path:
        # Pillow font sizing is in points; choose size so the rendered glyph
        # height roughly matches rank_h.
        font = ImageFont.truetype(font_path, size=int(rank_h * 1.0))
    else:
        font = ImageFont.load_default()

    # Center-align the rank text within the layer.
    bbox = ldraw.textbbox((0, 0), rank, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (layer_w - text_w) // 2 - bbox[0]
    text_y = -bbox[1]  # remove leading offset
    ldraw.text((text_x, text_y), rank, fill=color, font=font)

    # Composite small suit glyph below the text.
    sw, sh = suit_img.size
    scale = glyph_h / sh
    new_w = max(1, int(sw * scale))
    new_h = max(1, int(sh * scale))
    glyph = suit_img.resize((new_w, new_h), Image.LANCZOS)
    glyph_x = (layer_w - new_w) // 2
    glyph_y = text_h + pad
    layer.alpha_composite(glyph, dest=(glyph_x, glyph_y))

    # Top-left corner placement.
    margin_x = int(width * 0.04)
    margin_y = int(height * 0.03)
    canvas.alpha_composite(layer, dest=(margin_x, margin_y))

    # Bottom-right corner: rotated 180 degrees.
    rotated = layer.rotate(180)
    canvas.alpha_composite(
        rotated,
        dest=(width - margin_x - layer_w, height - margin_y - layer_h),
    )


# --- Pip layout ------------------------------------------------------------

def pip_positions(rank: str) -> List[Tuple[float, float, bool]]:
    """Return pip positions for a rank as (rel_x, rel_y, rotate_180) tuples,
    where rel_x and rel_y are fractions of the *body* area (0..1).

    The body area is the central region between the corner indices. Pips in
    the bottom half of the card are flagged for 180-degree rotation per
    standard playing-card convention.
    """
    # x-cols at 0.25, 0.5, 0.75; y-rows: top=0.10, mid_upper=0.30, mid=0.5,
    # mid_lower=0.70, bottom=0.90 (within the body region).
    L, C, R = 0.25, 0.50, 0.75
    TOP, MUT, MID, MLB, BOT = 0.10, 0.30, 0.50, 0.70, 0.90

    def rot(y: float) -> bool:
        return y > 0.5

    if rank == "A":
        return [(C, MID, False)]  # one big central pip; size handled by caller
    if rank == "2":
        return [(C, TOP, False), (C, BOT, True)]
    if rank == "3":
        return [(C, TOP, False), (C, MID, False), (C, BOT, True)]
    if rank == "4":
        return [
            (L, TOP, False), (R, TOP, False),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "5":
        return [
            (L, TOP, False), (R, TOP, False),
            (C, MID, False),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "6":
        return [
            (L, TOP, False), (R, TOP, False),
            (L, MID, False), (R, MID, False),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "7":
        return [
            (L, TOP, False), (R, TOP, False),
            (C, 0.22, False),
            (L, MID, False), (R, MID, False),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "8":
        return [
            (L, TOP, False), (R, TOP, False),
            (C, 0.22, False),
            (L, MID, False), (R, MID, False),
            (C, 0.78, True),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "9":
        return [
            (L, TOP, False), (R, TOP, False),
            (L, 0.32, False), (R, 0.32, False),
            (C, MID, False),
            (L, 0.68, True), (R, 0.68, True),
            (L, BOT, True), (R, BOT, True),
        ]
    if rank == "10":
        return [
            (L, TOP, False), (R, TOP, False),
            (L, 0.32, False), (R, 0.32, False),
            (C, 0.22, False),
            (C, 0.78, True),
            (L, 0.68, True), (R, 0.68, True),
            (L, BOT, True), (R, BOT, True),
        ]
    raise ValueError(f"Unknown rank: {rank}")


def render_pip_card(
    rank: str,
    suit_letter: str,
    suit_img: Image.Image,
    color: Tuple[int, int, int, int],
    width: int,
    height: int,
    font_path: Optional[str],
) -> Image.Image:
    """Render a single pip card (Ace through 10) with the given suit."""
    canvas = make_card_canvas(width, height)

    # Body area: between the corner indices. Conservative margins so pips
    # never collide with indices.
    body_top = int(height * 0.16)
    body_bottom = int(height * 0.84)
    body_left = int(width * 0.18)
    body_right = int(width * 0.82)
    body_w = body_right - body_left
    body_h = body_bottom - body_top

    if rank == "A":
        # One big central suit symbol.
        target_h = int(height * 0.50)
        composite_suit(
            canvas, suit_img,
            cx=width // 2, cy=height // 2,
            target_h=target_h,
        )
    else:
        target_h = int(height * 0.13)  # ~13% of card height
        for rel_x, rel_y, rotate in pip_positions(rank):
            cx = body_left + int(rel_x * body_w)
            cy = body_top + int(rel_y * body_h)
            composite_suit(canvas, suit_img, cx=cx, cy=cy,
                           target_h=target_h, rotate_180=rotate)

    render_index(canvas, rank, suit_img, color, font_path, width, height)
    return canvas


# --- Standalone suit symbols ----------------------------------------------

def render_suit_symbol(suit_img: Image.Image, size: int) -> Image.Image:
    """Render a standalone suit symbol on a transparent square canvas.

    The input ``suit_img`` is already cropped to its bounding box and has its
    white background keyed out (see ``load_suit_image``). This function
    scales it to fit within ``size`` x ``size`` while preserving aspect
    ratio, then centers it on a fully transparent canvas.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    sw, sh = suit_img.size
    # Leave a small margin so the glyph never touches the canvas edge —
    # downstream renderers might add their own border or shadow.
    margin = int(size * 0.05)
    target_box = size - 2 * margin
    scale = min(target_box / sw, target_box / sh)
    new_w = max(1, int(sw * scale))
    new_h = max(1, int(sh * scale))
    resized = suit_img.resize((new_w, new_h), Image.LANCZOS)

    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.alpha_composite(resized, dest=(x, y))
    return canvas


# --- Pipeline --------------------------------------------------------------

def inspect_sources(source_dir: Path) -> Tuple[int, int, Dict[str, dict]]:
    """Verify all required source files exist; return canonical card
    dimensions and a report dict.

    Canonical dimensions are taken from the court cards (j-c.png).
    """
    report: Dict[str, dict] = {}

    required = (
        ["club.png", "diamond.png", "heart.png", "spade.png"]
        + [f"{stem}.png" for stem in COURTS.values()]
        + [f"{stem}.png" for stem in JOKERS.values()]
        + [f"{stem}.png" for stem, _ in BACKS.values()]
    )
    missing = [name for name in required if not (source_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            "Missing required source files in "
            f"{source_dir}: {', '.join(missing)}"
        )

    # Use j-c.png (a court card) as the canonical reference.
    ref_path = source_dir / "j-c.png"
    with Image.open(ref_path) as ref:
        ref_w, ref_h = ref.size
    report["canonical"] = {"file": str(ref_path), "width": ref_w, "height": ref_h}

    # Sanity-check court aspect ratio (~5:7 = 1.4).
    aspect = ref_h / ref_w
    if not (1.30 <= aspect <= 1.50):
        sys.stderr.write(
            f"WARNING: Court aspect ratio {aspect:.3f} outside expected "
            "5:7 range (1.30-1.50). Continuing.\n"
        )

    # Quick check on each suit image: dimensions, transparency.
    for letter, stem, _ in SUITS:
        with Image.open(source_dir / f"{stem}.png") as si:
            mode = si.mode
            sw, sh = si.size
        report[stem] = {"width": sw, "height": sh, "mode": mode}

    return ref_w, ref_h, report


def write_or_skip(img: Image.Image, dest: Path, dry_run: bool) -> None:
    """Save an image to dest, or print what would be saved."""
    if dry_run:
        print(f"  [DRY] would write {dest}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, format="PNG", optimize=True)


def copy_or_skip(src: Path, dest: Path, dry_run: bool) -> None:
    """Copy a file from src to dest (no transformation), or print intent."""
    if dry_run:
        print(f"  [DRY] would copy {src.name} -> {dest}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


SUIT_LABELS: Dict[str, str] = {
    "club":    "Clubs",
    "diamond": "Diamonds",
    "heart":   "Hearts",
    "spade":   "Spades",
}


def _scan_suits(suits_dir: Path, ext: str) -> Dict[str, Dict[str, str]]:
    """Scan a suits directory for files with the given extension and
    return a deterministic dict keyed by suit name. Logs a warning if
    fewer than 4 entries are found."""
    found: Dict[str, Dict[str, str]] = {}
    if suits_dir.is_dir():
        for f in sorted(suits_dir.iterdir()):
            if not f.is_file() or f.suffix.lower() != ext.lower():
                continue
            name = f.stem
            label = SUIT_LABELS.get(name, name.title())
            found[name] = {
                "label": label,
                "path": f"suits/{f.name}",
            }
    if len(found) < 4:
        sys.stderr.write(
            f"WARNING: suits directory {suits_dir} contains "
            f"{len(found)} entr{'y' if len(found) == 1 else 'ies'} "
            "(expected 4: club, diamond, heart, spade). "
            "Writing what is present.\n"
        )
    return found


def write_manifest(output_dir: Path, dry_run: bool) -> None:
    """Scan the output dirs and write manifest.json. Backs are sorted by
    label so the picker is stable."""
    backs_dir = output_dir / "backs"
    found_backs = []
    if backs_dir.is_dir():
        for f in sorted(backs_dir.iterdir()):
            if f.suffix.lower() == ".png":
                back_id = f.stem
                # Look up label from BACKS mapping; fall back to titlecase.
                label = next(
                    (lbl for stem, (_, lbl) in BACKS.items() if stem == back_id),
                    back_id.replace("-", " ").title(),
                )
                found_backs.append({
                    "id": back_id,
                    "label": label,
                    "path": f"backs/{f.name}",
                })

    found_suits = _scan_suits(output_dir / "suits", ".png")

    manifest = {
        "schemaVersion": 1,
        "faces": {
            "default": {
                "label": "Standard",
                "format": "png",
                "path": "faces/",
            },
        },
        "backs": found_backs,
        "suits": found_suits,
    }

    dest = output_dir / "manifest.json"
    payload = json.dumps(manifest, indent=2) + "\n"
    if dry_run:
        print(f"  [DRY] would write {dest}:")
        print("    " + payload.replace("\n", "\n    ").rstrip())
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(payload, encoding="utf-8")


def run(source_dir: Path, output_dir: Path, dry_run: bool) -> None:
    print(f"Source: {source_dir}")
    print(f"Output: {output_dir}")
    print(f"Mode:   {'DRY-RUN' if dry_run else 'WRITE'}")
    print()

    print("Inspecting source files...")
    ref_w, ref_h, report = inspect_sources(source_dir)
    canonical = report["canonical"]
    print(f"  Canonical card size: {canonical['width']}x{canonical['height']} "
          f"(from {Path(canonical['file']).name})")
    aspect = canonical["height"] / canonical["width"]
    print(f"  Aspect ratio: {aspect:.3f} (expected ~1.4)")
    for letter, stem, _ in SUITS:
        info = report[stem]
        print(f"  Suit {stem}.png: {info['width']}x{info['height']} mode={info['mode']}")
    print()

    font_path = find_font_path()
    if font_path:
        print(f"Font: {font_path}")
    else:
        sys.stderr.write(
            "WARNING: No system font found from candidates; falling back to "
            "Pillow default. Card index text will be small.\n"
        )
    print()

    # Pre-load suit images (transparent-cropped).
    print("Loading suit images (whitening to alpha)...")
    suit_images: Dict[str, Image.Image] = {}
    for letter, stem, _ in SUITS:
        suit_images[letter] = load_suit_image(source_dir, stem)
        print(f"  {stem}.png -> cropped to {suit_images[letter].size}")
    print()

    pip_count = 0
    suit_count = 0
    court_count = 0
    joker_count = 0
    back_count = 0

    faces_dir = output_dir / "faces"
    backs_dir = output_dir / "backs"
    suits_dir = output_dir / "suits"

    # 1) Generate 40 pip cards.
    print("Generating pip cards...")
    for letter, _stem, color_label in SUITS:
        color = RED_COLOR if color_label == "red" else BLACK_COLOR
        suit_img = suit_images[letter]
        for rank in RANKS:
            card = render_pip_card(
                rank=rank,
                suit_letter=letter,
                suit_img=suit_img,
                color=color,
                width=ref_w,
                height=ref_h,
                font_path=font_path,
            )
            dest = faces_dir / f"{rank}{letter}.png"
            write_or_skip(card, dest, dry_run)
            pip_count += 1
    print(f"  -> {pip_count} pip cards")
    print()

    # 2) Emit standalone suit symbols (used for the trump indicator and
    #    other UI elements that need an isolated suit glyph).
    print("Generating standalone suit symbols...")
    for letter, stem, _color_label in SUITS:
        symbol = render_suit_symbol(suit_images[letter], SUIT_SYMBOL_SIZE)
        dest = suits_dir / f"{stem}.png"
        write_or_skip(symbol, dest, dry_run)
        suit_count += 1
    print(f"  -> {suit_count} suit symbols ({SUIT_SYMBOL_SIZE}x{SUIT_SYMBOL_SIZE} transparent)")
    print()

    # 3) Copy + rename court cards.
    print("Normalizing court cards...")
    for out_stem, src_stem in COURTS.items():
        src = source_dir / f"{src_stem}.png"
        dest = faces_dir / f"{out_stem}.png"
        copy_or_skip(src, dest, dry_run)
        court_count += 1
    print(f"  -> {court_count} court cards")
    print()

    # 4) Copy + rename jokers.
    print("Normalizing jokers...")
    for out_stem, src_stem in JOKERS.items():
        src = source_dir / f"{src_stem}.png"
        dest = faces_dir / f"{out_stem}.png"
        copy_or_skip(src, dest, dry_run)
        joker_count += 1
    print(f"  -> {joker_count} jokers (JK1=black, JK2=red)")
    print()

    # 5) Copy + rename backs.
    print("Normalizing backs...")
    for out_stem, (src_stem, _label) in BACKS.items():
        src = source_dir / f"{src_stem}.png"
        dest = backs_dir / f"{out_stem}.png"
        copy_or_skip(src, dest, dry_run)
        back_count += 1
    print(f"  -> {back_count} backs")
    print()

    # 6) Manifest.
    print("Writing manifest...")
    write_manifest(output_dir, dry_run)
    print()

    total = pip_count + suit_count + court_count + joker_count + back_count
    print("=" * 50)
    print(
        f"Generated {pip_count} pip cards and {suit_count} suit symbols. "
        f"Renamed {court_count + joker_count + back_count} source files. "
        f"Wrote manifest. "
        f"Total output: {total} files in {output_dir}."
    )
    if dry_run:
        print("\nThis was a DRY-RUN. Re-run without --dry-run to actually write files.")


# --- CLI -------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate the 40 missing pip cards and normalize externally-"
            "generated court cards, jokers, and backs into the project's "
            "canonical card-art layout."
        ),
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Source directory containing the externally-generated cards "
             f"(default: {DEFAULT_SOURCE})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files; print what would be done.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    try:
        run(args.source.resolve(), args.output.resolve(), args.dry_run)
    except FileNotFoundError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 2
    except Exception as e:  # pragma: no cover - last-ditch error reporter
        sys.stderr.write(f"ERROR: {e.__class__.__name__}: {e}\n")
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
