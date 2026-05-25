"""Render clean PDF page images for the web app.

Produces one WebP per page of each section's split PDF.
Images go to web/public/pages/{section_slug}/P{page}.webp.
Supports both operating and capital budget types.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import DEFAULT_YEAR, expected_dir, input_dir, sections_path, split_pdf_dir, variant_type

WEB_PUBLIC_DIR = Path(__file__).parent.parent / "web" / "public" / "pages"

DIR_PATTERN = re.compile(r"^(\d+)_(.+)$")
FILE_PATTERN = re.compile(r"^P(\d+)T\d+\.csv$")


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def render_budget_type(budget_type: str, year: int = DEFAULT_YEAR, variant: str = "adopted") -> int:
    """Render page images for a single budget type/variant. Returns total image count."""
    import fitz  # PyMuPDF

    subtype = variant_type(budget_type, variant)
    sections_file = sections_path(year, subtype)
    exp_dir = expected_dir(year, subtype)
    split_dir = split_pdf_dir(year, subtype)

    if not sections_file.exists():
        print(f"  SKIP {budget_type}: no sections file at {sections_file}")
        return 0

    with open(sections_file, encoding="utf-8") as f:
        sections_list = json.load(f)
    sections_lookup: dict[int, dict] = {}
    for i, s in enumerate(sections_list, start=1):
        sections_lookup[i] = s

    total_images = 0

    # Determine source directories: expected dir (if it exists) or split-pdf dir
    if exp_dir.exists():
        source_dirs = sorted(exp_dir.iterdir())
    else:
        # For budget types without expected CSVs, derive from split PDFs directly
        source_dirs = []

    # If we have expected dirs, use them to discover sections with tables
    if source_dirs:
        for dir_path in source_dirs:
            if not dir_path.is_dir():
                continue
            match = DIR_PATTERN.match(dir_path.name)
            if not match:
                continue

            section_num = int(match.group(1))
            section_info = sections_lookup.get(section_num, {})
            title = section_info.get("title", match.group(2).replace("_", " "))
            slug = slugify(title)

            # Find the split PDF
            found_pdf = None
            for candidate in split_dir.glob(f"*{dir_path.name}*.pdf"):
                if dir_path.name in candidate.stem:
                    found_pdf = candidate
                    break

            if not found_pdf or not found_pdf.exists():
                print(f"  SKIP {dir_path.name}: no PDF found")
                continue

            total_images += _render_pdf(found_pdf, slug)
    else:
        # No expected dir — render all split PDFs directly
        if not split_dir.exists():
            print(f"  SKIP {budget_type}: no split PDFs at {split_dir}")
            return 0

        for found_pdf in sorted(split_dir.glob("*.pdf")):
            match = DIR_PATTERN.match(found_pdf.stem)
            if not match:
                continue
            section_num = int(match.group(1))
            section_info = sections_lookup.get(section_num, {})
            title = section_info.get("title", match.group(2).replace("_", " "))
            slug = slugify(title)
            total_images += _render_pdf(found_pdf, slug)

    return total_images


def _render_pdf(pdf_path: Path, slug: str) -> int:
    """Render all pages of a PDF to WebP images. Returns number of images."""
    import fitz  # PyMuPDF
    from PIL import Image

    out_dir = WEB_PUBLIC_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(pdf_path))
    rendered = 0
    for page_idx in range(len(doc)):
        out_path = out_dir / f"P{page_idx}.webp"
        if out_path.exists():
            rendered += 1
            continue
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=120)
        pil_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        pil_img.save(str(out_path), "WEBP", quality=80)
        pil_img.close()
        rendered += 1

    doc.close()
    if rendered > 0:
        print(f"  {slug}: {rendered} page images")
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser(description="Render PDF page images for web app")
    parser.add_argument(
        "--budget-type",
        choices=["operating", "capital", "all"],
        default="all",
        help="Which budget type to render (default: all)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=DEFAULT_YEAR,
        help=f"Budget year (default: {DEFAULT_YEAR})",
    )
    parser.add_argument(
        "--variant",
        default="adopted",
        help="Budget variant to render (default: adopted; e.g. 'amended')",
    )
    args = parser.parse_args()

    budget_types = ["operating", "capital"] if args.budget_type == "all" else [args.budget_type]

    total = 0
    for bt in budget_types:
        print(f"\n=== {bt.upper()} BUDGET ===")
        total += render_budget_type(bt, args.year, args.variant)

    print(f"\nRendered {total} total page images to {WEB_PUBLIC_DIR}")


if __name__ == "__main__":
    main()
