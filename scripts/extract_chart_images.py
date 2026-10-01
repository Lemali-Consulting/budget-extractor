"""Extract detected chart/image regions from budget PDF pages as cropped WebP images.

Reads chart region data from budget-data.json and capital-budget-data.json,
then crops the corresponding regions from the year's (variant) PDFs, saving them to
web/public/charts/{year}/{slug}/.
"""

import argparse
import json
import sys
from pathlib import Path

import pdfplumber
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import DEFAULT_YEAR, variant_paths

BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / "web" / "public" / "charts"

# Variant preference when none is requested explicitly.
AUTO_VARIANT_ORDER: tuple[str, ...] = ("amended", "adopted", "proposed")

DPI = 300  # render resolution (high enough to read map labels and fine text)


def chart_output_dir(year: int) -> Path:
    """Directory holding one year's chart crops: web/public/charts/{year}."""
    return OUTPUT_DIR / str(year)


def extract_charts_from_data(data: dict, *, pdf_path: Path, out_base: Path) -> int:
    """Extract chart images for all sections in a budget data bundle.

    Returns the number of chart images extracted.
    """
    if not pdf_path.exists():
        print(f"  Skipping {pdf_path.name}: file not found")
        return 0

    pdf = pdfplumber.open(str(pdf_path))
    total = 0

    for section in data["sections"]:
        slug = section["slug"]
        for pc in section.get("page_content", []):
            charts = pc.get("chart_regions", [])
            if not charts:
                continue

            abs_page = pc["absolute_page"]
            rel_page = pc["relative_page"]
            page = pdf.pages[abs_page - 1]

            # Render the full page as an image
            page_img = page.to_image(resolution=DPI)
            pil_img: Image.Image = page_img.original

            # Scale factor from PDF points to pixels
            scale = DPI / 72.0

            for i, chart in enumerate(charts):
                bbox = chart["bbox"]  # [x0, y0, x1, y1] in PDF points
                # Convert to pixel coordinates
                crop_box = (
                    int(bbox[0] * scale),
                    int(bbox[1] * scale),
                    int(bbox[2] * scale),
                    int(bbox[3] * scale),
                )

                cropped = pil_img.crop(crop_box)

                out_dir = out_base / slug
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f"P{rel_page}C{i}.webp"
                cropped.save(str(out_path), "WEBP", quality=80)
                total += 1

    pdf.close()
    return total


def resolve_source_pdf(*, year: int, budget_type: str, variant: str | None) -> Path:
    """PDF to crop charts from: the requested variant, or the first that exists.

    With no variant requested, prefer amended, then adopted, then proposed (the
    data bundle is built from whichever variant the deploy chose).
    """
    candidates: tuple[str, ...] = (variant,) if variant else AUTO_VARIANT_ORDER
    for candidate in candidates:
        pdf_path: Path = variant_paths(year=year, budget_type=budget_type, variant=candidate).pdf
        if pdf_path.exists():
            return pdf_path
    return variant_paths(year=year, budget_type=budget_type, variant=candidates[0]).pdf


def extract_budget_type(*, data_path: Path, pdf_path: Path, out_base: Path, label: str) -> int:
    """Extract charts for one budget bundle if its data file exists; returns the image count."""
    if not data_path.exists():
        return 0
    with open(data_path, encoding="utf-8") as f:
        data: dict = json.load(f)
    count: int = extract_charts_from_data(data, pdf_path=pdf_path, out_base=out_base)
    print(f"  {label}: {count} chart images")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, help=f"Budget year (default: {DEFAULT_YEAR})")
    parser.add_argument("--operating-variant", default=None,
                        help="Operating variant whose PDF to crop (default: amended, else adopted, else proposed)")
    parser.add_argument("--capital-variant", default=None,
                        help="Capital variant whose PDF to crop (default: amended, else adopted, else proposed)")
    parser.add_argument("--output-prefix", default="",
                        help="Filename prefix of the data bundles, e.g. '2025' -> 2025-budget-data.json")
    args = parser.parse_args()
    prefix: str = f"{args.output_prefix}-" if args.output_prefix else ""
    data_dir: Path = BASE_DIR / "web" / "src" / "data"
    out_base: Path = chart_output_dir(args.year)

    total: int = extract_budget_type(
        data_path=data_dir / f"{prefix}budget-data.json",
        pdf_path=resolve_source_pdf(year=args.year, budget_type="operating", variant=args.operating_variant),
        out_base=out_base,
        label="Operating",
    )
    total += extract_budget_type(
        data_path=data_dir / f"{prefix}capital-budget-data.json",
        pdf_path=resolve_source_pdf(year=args.year, budget_type="capital", variant=args.capital_variant),
        out_base=out_base,
        label="Capital",
    )
    print(f"Extracted {total} chart images total to {out_base}")


if __name__ == "__main__":
    main()
