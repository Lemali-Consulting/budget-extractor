"""Render clean PDF page images for the web app.

Produces one PNG per page of each section's split PDF.
Images go to web/public/pages/{section_slug}/P{page}.png.
"""

import json
import re
from pathlib import Path

INPUT_DIR = Path(__file__).parent.parent / "input"
EXPECTED_DIR = Path(__file__).parent.parent / "output" / "regression" / "expected" / "operating"
WEB_PUBLIC_DIR = Path(__file__).parent.parent / "web" / "public" / "pages"

DIR_PATTERN = re.compile(r"^(\d+)_(.+)$")
FILE_PATTERN = re.compile(r"^P(\d+)T\d+\.csv$")


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def main() -> None:
    import fitz  # PyMuPDF

    # Load sections for slug mapping
    with open(INPUT_DIR / "sections-operating.json", encoding="utf-8") as f:
        sections_list = json.load(f)
    sections_lookup: dict[int, dict] = {}
    for i, s in enumerate(sections_list, start=1):
        sections_lookup[i] = s

    total_images = 0

    for dir_path in sorted(EXPECTED_DIR.iterdir()):
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
        for candidate in (INPUT_DIR / "split-pdf").glob(f"*{dir_path.name}*.pdf"):
            if dir_path.name in candidate.stem:
                pdf_path = candidate
                break

        if not pdf_path or not pdf_path.exists():
            print(f"  SKIP {dir_path.name}: no PDF found")
            continue

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
        total_images += rendered
        print(f"  {slug}: {rendered} page images")

    print(f"\nRendered {total_images} total page images to {WEB_PUBLIC_DIR}")


if __name__ == "__main__":
    main()
