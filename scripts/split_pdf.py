"""Split a budget PDF into individual section PDFs based on a sections JSON file."""

import argparse
import json
import re
from pathlib import Path

import pypdf

BUDGET_TYPES = {
    "operating": {
        "pdf": "input/2026-operating-budget.pdf",
        "sections": "input/sections-operating.json",
    },
    "capital": {
        "pdf": "input/2026-capital-budget.pdf",
        "sections": "input/sections-capital.json",
    },
}


def sanitize_filename(title: str) -> str:
    """Convert a section title to a safe filename."""
    # Replace special characters with underscores
    name = re.sub(r"[^\w\s\-]", "", title)
    name = re.sub(r"\s+", "_", name.strip())
    return name


def split_pdf(pdf_path: str, sections_path: str, output_dir: str) -> None:
    """Split a PDF into sections based on a sections JSON file."""
    reader = pypdf.PdfReader(pdf_path)
    total_pages = len(reader.pages)

    with open(sections_path) as f:
        sections: list[dict] = json.load(f)

    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    for i, section in enumerate(sections):
        title: str = section["title"]
        start: int = section["start_page"]
        end: int = section.get("end_page") or total_pages

        # Zero-pad the index for sorting
        filename = f"{i + 1:02d}_{sanitize_filename(title)}.pdf"
        filepath = output / filename

        writer = pypdf.PdfWriter()
        for page_num in range(start - 1, min(end, total_pages)):
            writer.add_page(reader.pages[page_num])

        with open(filepath, "wb") as f:
            writer.write(f)

        print(f"  {filename} ({end - start + 1} pages)")

    print(f"\nWrote {len(sections)} files to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a budget PDF into section PDFs.")
    parser.add_argument(
        "--budget-type",
        choices=list(BUDGET_TYPES.keys()),
        default="operating",
        help="Which budget to split (default: operating)",
    )
    args = parser.parse_args()

    config = BUDGET_TYPES[args.budget_type]
    split_pdf(
        pdf_path=config["pdf"],
        sections_path=config["sections"],
        output_dir=f"input/split-pdf/{args.budget_type}",
    )


if __name__ == "__main__":
    main()
