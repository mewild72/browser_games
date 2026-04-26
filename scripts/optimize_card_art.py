#!/usr/bin/env python3
"""Generate WebP-optimized card art alongside the canonical PNG originals.

Reads from the existing PNG card art at src/assets/cards/{faces,backs,suits}/
and writes a parallel optimized tree at src/assets/cards/optimized/ with WebP
files sized to canonical web dimensions. The originals are never modified.

Pipeline (per file):
  1. Open the PNG with Pillow (RGBA)
  2. Resize to the dimensions appropriate for the directory (faces/backs at
     600x840, suits at 600x600) with LANCZOS resampling (idempotent — no-op
     if already at target size)
  3. Encode as WebP at quality=85, method=6, no metadata
  4. Write to optimized/{faces,backs,suits}/<stem>.webp

Manifest:
  optimized/manifest.json mirrors the original schema but with format='webp'
  and webp paths. Backs and suits are auto-detected by scanning the
  corresponding optimized directories after writing.

Usage:
  python scripts/optimize_card_art.py [--source DIR] [--output DIR]
                                      [--quality N] [--dry-run]

Defaults:
  --source   src/assets/cards            (relative to repo root)
  --output   src/assets/cards/optimized
  --quality  85

Re-running overwrites existing output cleanly. Source PNGs are read-only.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image, features
except ImportError:
    sys.stderr.write(
        "ERROR: Pillow is required. Install with `pip install Pillow` "
        "(or `pip install --break-system-packages Pillow` on system Python).\n"
    )
    sys.exit(1)


# --- Constants -------------------------------------------------------------

# Default source/output are relative to repo root (parent of scripts/).
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT / "src" / "assets" / "cards"
DEFAULT_OUTPUT = REPO_ROOT / "src" / "assets" / "cards" / "optimized"

# Canonical web dimensions per skills/card-art-pipeline.md.
TARGET_W = 600
TARGET_H = 840

# Suit symbols are 1:1 — used by the trump indicator and other UI that needs
# an isolated suit glyph. 600x600 matches the largest dimension of the cards
# so downscaling to varied UI sizes stays sharp.
SUIT_TARGET_W = 600
SUIT_TARGET_H = 600

# Human-readable labels for the four suits.
SUIT_LABELS: Dict[str, str] = {
    "club":    "Clubs",
    "diamond": "Diamonds",
    "heart":   "Hearts",
    "spade":   "Spades",
}

# Human-readable labels for known back IDs. Falls back to title-cased id for
# anything not listed here.
BACK_LABELS: Dict[str, str] = {
    "classic-blue":   "Classic Blue",
    "classic-red":    "Classic Red",
    "forest-green":   "Forest Green",
    "royal-purple":   "Royal Purple",
    "midnight-black": "Midnight Black",
    "geometric":      "Geometric",
    "minimal":        "Minimal",
}


# --- Conversion ------------------------------------------------------------

def convert_png_to_webp(
    src: Path,
    dest: Path,
    quality: int,
    dry_run: bool,
    target_w: int = TARGET_W,
    target_h: int = TARGET_H,
) -> Tuple[int, int]:
    """Convert a single PNG to a target_w x target_h WebP at the given
    quality.

    Returns (src_bytes, dest_bytes). dest_bytes is 0 when dry_run is True.
    """
    src_bytes = src.stat().st_size

    if dry_run:
        print(f"  [DRY] {src.relative_to(REPO_ROOT)} -> "
              f"{dest.relative_to(REPO_ROOT)} "
              f"({target_w}x{target_h} webp q={quality})")
        return src_bytes, 0

    with Image.open(src) as img:
        img = img.convert("RGBA")
        if img.size != (target_w, target_h):
            img = img.resize((target_w, target_h), Image.LANCZOS)

        dest.parent.mkdir(parents=True, exist_ok=True)
        # method=6 is slowest/best compression. exif/icc/xmp default empty so
        # nothing extra is embedded — explicit empty exif strips anything that
        # might otherwise carry through.
        img.save(
            dest,
            format="WEBP",
            quality=quality,
            method=6,
            exif=b"",
            icc_profile=None,
        )

    return src_bytes, dest.stat().st_size


def convert_directory(
    src_dir: Path,
    dest_dir: Path,
    quality: int,
    dry_run: bool,
    label: str,
    target_w: int = TARGET_W,
    target_h: int = TARGET_H,
    required: bool = True,
) -> Tuple[int, int, int]:
    """Convert every *.png in src_dir into <stem>.webp in dest_dir.

    Returns (file_count, total_src_bytes, total_dest_bytes).

    When ``required`` is False, a missing src_dir is tolerated (returns
    zeros with a warning) — used for optional asset categories like suits.
    """
    if not src_dir.is_dir():
        if required:
            raise FileNotFoundError(f"Source directory missing: {src_dir}")
        sys.stderr.write(f"WARNING: optional source dir missing: {src_dir}\n")
        return 0, 0, 0

    pngs = sorted(p for p in src_dir.iterdir()
                  if p.is_file() and p.suffix.lower() == ".png")

    if not pngs:
        sys.stderr.write(f"WARNING: no PNG files in {src_dir}\n")
        return 0, 0, 0

    print(f"Converting {label} ({len(pngs)} files)...")
    total_src = 0
    total_dest = 0
    for src in pngs:
        dest = dest_dir / f"{src.stem}.webp"
        sb, db = convert_png_to_webp(
            src, dest, quality, dry_run,
            target_w=target_w, target_h=target_h,
        )
        total_src += sb
        total_dest += db
    print(f"  -> {len(pngs)} {label} converted")

    return len(pngs), total_src, total_dest


# --- Manifest --------------------------------------------------------------

def build_manifest(output_dir: Path) -> Dict[str, object]:
    """Scan output_dir/backs and output_dir/suits and build a manifest dict
    referencing webp paths. Backs are sorted by id for deterministic output;
    suits are emitted as an object keyed by suit name."""
    backs_dir = output_dir / "backs"
    backs: List[Dict[str, str]] = []
    if backs_dir.is_dir():
        for f in sorted(backs_dir.iterdir()):
            if not f.is_file() or f.suffix.lower() != ".webp":
                continue
            back_id = f.stem
            label = BACK_LABELS.get(back_id, back_id.replace("-", " ").title())
            backs.append({
                "id": back_id,
                "label": label,
                "path": f"backs/{f.name}",
            })

    suits_dir = output_dir / "suits"
    suits: Dict[str, Dict[str, str]] = {}
    if suits_dir.is_dir():
        for f in sorted(suits_dir.iterdir()):
            if not f.is_file() or f.suffix.lower() != ".webp":
                continue
            name = f.stem
            label = SUIT_LABELS.get(name, name.title())
            suits[name] = {
                "label": label,
                "path": f"suits/{f.name}",
            }
    if len(suits) < 4:
        sys.stderr.write(
            f"WARNING: optimized suits directory contains {len(suits)} "
            "entries (expected 4: club, diamond, heart, spade). "
            "Manifest will reflect what is present.\n"
        )

    return {
        "schemaVersion": 1,
        "faces": {
            "default": {
                "label": "Standard",
                "format": "webp",
                "path": "faces/",
            },
        },
        "backs": backs,
        "suits": suits,
    }


def write_manifest(output_dir: Path, dry_run: bool) -> Dict[str, object]:
    """Build and write the manifest.json. Returns the manifest dict.

    In dry-run mode the manifest is built from whatever's currently on disk
    (which may not include the not-yet-written webps). The dry-run output is
    informational only — re-run without --dry-run for the real manifest.
    """
    manifest = build_manifest(output_dir)
    payload = json.dumps(manifest, indent=2) + "\n"
    dest = output_dir / "manifest.json"

    if dry_run:
        print(f"  [DRY] would write {dest.relative_to(REPO_ROOT)} "
              f"(scanned {len(manifest['backs'])} backs and "
              f"{len(manifest['suits'])} suits from current disk state)")
        return manifest

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(payload, encoding="utf-8")
    return manifest


# --- Pipeline --------------------------------------------------------------

def fmt_bytes(n: int) -> str:
    """Human-readable byte count (binary units)."""
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KiB"
    return f"{n / (1024 * 1024):.2f} MiB"


def run(
    source_dir: Path,
    output_dir: Path,
    quality: int,
    dry_run: bool,
) -> int:
    print(f"Source: {source_dir}")
    print(f"Output: {output_dir}")
    print(f"Target: faces/backs {TARGET_W}x{TARGET_H}, "
          f"suits {SUIT_TARGET_W}x{SUIT_TARGET_H} "
          f"WebP (quality={quality}, method=6)")
    print(f"Mode:   {'DRY-RUN' if dry_run else 'WRITE'}")
    print()

    if not features.check("webp"):
        sys.stderr.write(
            "ERROR: This Pillow build does not support WebP. "
            "Install a Pillow wheel with WebP support (most pip wheels do).\n"
        )
        return 3

    src_faces = source_dir / "faces"
    src_backs = source_dir / "backs"
    src_suits = source_dir / "suits"
    out_faces = output_dir / "faces"
    out_backs = output_dir / "backs"
    out_suits = output_dir / "suits"

    if not src_faces.is_dir():
        sys.stderr.write(f"ERROR: Missing source faces dir: {src_faces}\n")
        return 2
    if not src_backs.is_dir():
        sys.stderr.write(f"ERROR: Missing source backs dir: {src_backs}\n")
        return 2

    face_n, face_src, face_dest = convert_directory(
        src_faces, out_faces, quality, dry_run, "faces")
    print()
    back_n, back_src, back_dest = convert_directory(
        src_backs, out_backs, quality, dry_run, "backs")
    print()
    # Suits are optional: we tolerate a missing src dir so this script keeps
    # working in older checkouts where generate_card_art.py hasn't been re-run
    # yet. If the dir exists but has fewer than 4 files, build_manifest logs
    # the warning.
    suit_n, suit_src, suit_dest = convert_directory(
        src_suits, out_suits, quality, dry_run, "suits",
        target_w=SUIT_TARGET_W, target_h=SUIT_TARGET_H,
        required=False,
    )
    print()

    print("Writing manifest...")
    manifest = write_manifest(output_dir, dry_run)
    print(f"  -> {len(manifest['backs'])} backs and "
          f"{len(manifest['suits'])} suits in manifest")
    print()

    total_src = face_src + back_src + suit_src
    total_dest = face_dest + back_dest + suit_dest

    print("=" * 60)
    print(f"Files: {face_n} faces + {back_n} backs + {suit_n} suits = "
          f"{face_n + back_n + suit_n} total")
    if dry_run:
        print(f"Source size:    {fmt_bytes(total_src)}")
        print("Optimized size: (not measured in dry-run)")
        print()
        print("This was a DRY-RUN. Re-run without --dry-run to write files.")
    else:
        ratio = (total_dest / total_src * 100) if total_src else 0
        print(f"Source size:    {fmt_bytes(total_src)}")
        print(f"Optimized size: {fmt_bytes(total_dest)} ({ratio:.1f}% of source)")
    return 0


# --- CLI -------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate WebP-optimized card art (600x840) from the canonical "
            "PNG originals. Reads src/assets/cards/{faces,backs}/*.png and "
            "writes optimized/{faces,backs}/*.webp + manifest.json. "
            "Originals are read-only; never modified."
        ),
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Source directory containing faces/ and backs/ (default: "
             f"{DEFAULT_SOURCE.relative_to(REPO_ROOT)})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output directory for optimized art (default: "
             f"{DEFAULT_OUTPUT.relative_to(REPO_ROOT)})",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=85,
        help="WebP quality 1-100 (default: 85)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files; print what would be done.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    if not (1 <= args.quality <= 100):
        sys.stderr.write(
            f"ERROR: --quality must be between 1 and 100 (got {args.quality}).\n"
        )
        return 2
    try:
        return run(
            args.source.resolve(),
            args.output.resolve(),
            args.quality,
            args.dry_run,
        )
    except FileNotFoundError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
