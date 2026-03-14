"""Render clean PDF page images for the web app.

Produces one PNG per page of each section's split PDF.
Images go to web/public/pages/{section_slug}/P{page}.png.
Supports both operating and capital budget types.
"""

import argparse
import json
import re
from pathlib import Path

INPUT_DIR = Path(__file__).parent.parent / "input"
EXPECTED_DIR = Path(__file__).parent.parent / "output" / "regression" / "expected"
WEB_PUBLIC_DIR = Path(__file__).parent.parent / "web" / "public" / "pages"

DIR_PATTERN = re.compile(r"^(\d+)_(.+)$")
FILE_PATTERN = re.compile(r"^P(\d+)T\d+\.csv$")


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def render_budget_type(budget_type: str) -> int:
    """Render page images for a single budget type. Returns total image count."""
    import fitz  # PyMuPDF

    sections_file = INPUT_DIR / f"sections-{budget_type}.json"
    expected_dir = EXPECTED_DIR / budget_type
    split_pdf_dir = INPUT_DIR / "split-pdf" / budget_type

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
    if expected_dir.exists():
        source_dirs = sorted(expected_dir.iterdir())
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
            pdf_path = None
            for candidate in split_pdf_dir.glob(f"*{dir_path.name}*.pdf"):
                if dir_path.name in candidate.stem:
                    pdf_path = candidate
                    break

            if not pdf_path or not pdf_path.exists():
                print(f"  SKIP {dir_path.name}: no PDF found")
                continue

            total_images += _render_pdf(pdf_path, slug)
    else:
        # No expected dir — render all split PDFs directly
        if not split_pdf_dir.exists():
            print(f"  SKIP {budget_type}: no split PDFs at {split_pdf_dir}")
            return 0

        for pdf_path in sorted(split_pdf_dir.glob("*.pdf")):
            match = DIR_PATTERN.match(pdf_path.stem)
            if not match:
                continue
            section_num = int(match.group(1))
            section_info = sections_lookup.get(section_num, {})
            title = section_info.get("title", match.group(2).replace("_", " "))
            slug = slugify(title)
            total_images += _render_pdf(pdf_path, slug)

    return total_images


def _render_pdf(pdf_path: Path, slug: str) -> int:
    """Render all pages of a PDF to PNGs. Returns number of images."""
    import fitz  # PyMuPDF

    out_dir = WEB_PUBLIC_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(pdf_path))
    rendered = 0
    for page_idx in range(len(doc)):
        out_path = out_dir / f"P{page_idx}.png"
        if out_path.exists():
            rendered += 1
            continue
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=150)
        pix.save(str(out_path))
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
    args = parser.parse_args()

    budget_types = ["operating", "capital"] if args.budget_type == "all" else [args.budget_type]

    total = 0
    for bt in budget_types:
        print(f"\n=== {bt.upper()} BUDGET ===")
        total += render_budget_type(bt)

    print(f"\nRendered {total} total page images to {WEB_PUBLIC_DIR}")


if __name__ == "__main__":
    main()
