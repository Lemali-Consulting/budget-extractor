"""Split a budget PDF into individual section PDFs based on a sections JSON file."""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pypdf

from utils.paths import DEFAULT_YEAR, pdf_path, sections_path, split_pdf_dir


def sanitize_filename(title: str) -> str:
    """Convert a section title to a safe filename."""
    # Replace special characters with underscores
    name = re.sub(r"[^\w\s\-]", "", title)
    name = re.sub(r"\s+", "_", name.strip())
    return name


def split_pdf(pdf_file: str, sections_file: str, output_dir: str) -> None:
    """Split a PDF into sections based on a sections JSON file."""
    reader = pypdf.PdfReader(pdf_file)
    total_pages = len(reader.pages)

    with open(sections_file) as f:
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
        choices=["operating", "capital"],
        default="operating",
        help="Which budget to split (default: operating)",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=DEFAULT_YEAR,
        help=f"Budget year (default: {DEFAULT_YEAR})",
    )
    args = parser.parse_args()

    split_pdf(
        pdf_file=str(pdf_path(args.year, args.budget_type)),
        sections_file=str(sections_path(args.year, args.budget_type)),
        output_dir=str(split_pdf_dir(args.year, args.budget_type)),
    )


if __name__ == "__main__":
    main()
