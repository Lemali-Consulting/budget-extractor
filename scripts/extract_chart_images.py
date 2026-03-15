"""Extract detected chart/image regions from budget PDF pages as cropped WebP images.

Reads chart region data from budget-data.json and capital-budget-data.json,
then crops the corresponding regions from the PDFs, saving them to
web/public/charts/{slug}/.
"""

import json
from pathlib import Path

import pdfplumber
from PIL import Image

BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / "web" / "public" / "charts"

DPI = 150  # render resolution


def extract_charts_from_data(data: dict, pdf_path: Path) -> int:
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

                out_dir = OUTPUT_DIR / slug
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f"P{rel_page}C{i}.webp"
                cropped.save(str(out_path), "WEBP", quality=80)
                total += 1

    pdf.close()
    return total


def main() -> None:
    total = 0

    # Operating budget
    operating_data_path = BASE_DIR / "web" / "src" / "data" / "budget-data.json"
    operating_pdf_path = BASE_DIR / "input" / "2026-operating-budget.pdf"
    if operating_data_path.exists():
        data = json.load(open(operating_data_path, encoding="utf-8"))
        count = extract_charts_from_data(data, operating_pdf_path)
        print(f"  Operating: {count} chart images")
        total += count

    # Capital budget
    capital_data_path = BASE_DIR / "web" / "src" / "data" / "capital-budget-data.json"
    capital_pdf_path = BASE_DIR / "input" / "2026-capital-budget.pdf"
    if capital_data_path.exists():
        data = json.load(open(capital_data_path, encoding="utf-8"))
        count = extract_charts_from_data(data, capital_pdf_path)
        print(f"  Capital: {count} chart images")
        total += count

    print(f"Extracted {total} chart images total to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
