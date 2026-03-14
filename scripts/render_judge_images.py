"""Render PDF page images needed for LLM judging."""

import sys
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

INPUT_DIRS = ["input/split-pdf"]


def find_pdf(stem: str, project_root: Path) -> Path | None:
    for input_dir in INPUT_DIRS:
        candidates = list((project_root / input_dir).glob(f"*{stem}*.pdf"))
        if not candidates:
            candidates = list((project_root / input_dir).glob(f"*_{stem}.pdf"))
        for c in candidates:
            if stem in c.stem:
                return c
    return None


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    expected_root = project_root / "output" / "regression" / "expected"
    image_dir = project_root / "output" / "regression" / "judge_images"

    stems = sorted(
        d.name for d in expected_root.iterdir()
        if d.is_dir() and any(d.glob("P*T*.csv"))
    )

    total_images = 0
    for stem in stems:
        pdf_path = find_pdf(stem, project_root)
        if not pdf_path:
            print(f"WARNING: PDF not found for {stem}")
            continue

        # Find which pages have tables
        csv_files = sorted((expected_root / stem).glob("P*T*.csv"))
        pages_needed: set[int] = set()
        for csv_file in csv_files:
            tag = csv_file.stem
            page_idx = int(tag.split("T")[0].replace("P", ""))
            pages_needed.add(page_idx)

        # Render those pages
        stem_dir = image_dir / stem
        stem_dir.mkdir(parents=True, exist_ok=True)

        doc = fitz.open(str(pdf_path))
        for page_idx in sorted(pages_needed):
            out_path = stem_dir / f"P{page_idx}.png"
            if out_path.exists():
                total_images += 1
                continue
            page = doc[page_idx]
            mat = fitz.Matrix(150 / 72, 150 / 72)
            pix = page.get_pixmap(matrix=mat)
            pix.save(str(out_path))
            total_images += 1
        doc.close()

    print(f"Rendered {total_images} page images across {len(stems)} PDFs to {image_dir}")


if __name__ == "__main__":
    main()
