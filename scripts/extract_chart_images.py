"""Extract detected chart/image regions from budget PDF pages as cropped PNGs.

Reads chart region data from budget-data.json and crops the corresponding
regions from the PDF, saving them to web/public/charts/{slug}/.
"""

import json
from pathlib import Path

import pdfplumber
from PIL import Image

PDF_PATH = Path(__file__).parent.parent / "input" / "2026-operating-budget.pdf"
DATA_PATH = Path(__file__).parent.parent / "web" / "src" / "data" / "budget-data.json"
OUTPUT_DIR = Path(__file__).parent.parent / "web" / "public" / "charts"

DPI = 200  # render resolution


def main() -> None:
    data = json.load(open(DATA_PATH, encoding="utf-8"))
    pdf = pdfplumber.open(str(PDF_PATH))

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
                out_path = out_dir / f"P{rel_page}C{i}.png"
                cropped.save(str(out_path), "PNG", optimize=True)
                total += 1

    pdf.close()
    print(f"Extracted {total} chart images to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
