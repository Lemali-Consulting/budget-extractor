"""Extract tables from image-based PDF pages using OCR (tesseract)."""

import re
from dataclasses import dataclass
from typing import Optional

from pdfplumber.page import Page

from utils.spatial_table_extractor import SpatialColumn, SpatialRow, SpatialTable


@dataclass
class OcrWord:
    """A word detected by OCR with its bounding box in PDF points."""

    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    confidence: int


def is_image_page(page: Page, min_image_area: float = 50000, max_chars: int = 200) -> bool:
    """
    Detect whether a PDF page has its content as an embedded image rather
    than selectable text.  Returns True when the page has a large image
    and very few real text characters.
    """
    if len(page.chars) > max_chars:
        return False

    for img in page.images:
        area = (img["x1"] - img["x0"]) * (img["bottom"] - img["top"])
        if area >= min_image_area:
            return True

    return False


# ── MMO worksheet patterns ────────────────────────────────────────────

# Matches the numbered line items: "1. TOTAL ANNUAL PAYROLL"
# The period after the digit may be missing in OCR (e.g., "4 TOTAL")
_ITEM_RE = re.compile(r"^(\d)\.?\s+(.+)")

# Common OCR substitutions for the "$" sign
_DOLLAR_CHARS = r"[$§sSb&]"

# Matches a dollar value at the end of a line, allowing OCR noise for "$"
# Examples: "$ 86,618,973", "§$ 86,618,973", "$15,892,782", "S 810,166"
_DOLLAR_VALUE_RE = re.compile(
    rf"{_DOLLAR_CHARS}+\s*"       # one or more dollar-like chars + optional space
    r"([\d,]+(?:\s\d{3})*"        # digits with commas, possibly spaces between groups
    r"(?:\.\d+)?)"                # optional decimal part
    r"\s*$"                       # end of line
)

# Matches a percentage at the end of a line
# Examples: "19.30%", "9.31%", "9.009." (OCR misread of "9.00%")
_PERCENT_VALUE_RE = re.compile(
    r"(\d+\.\d+)"           # decimal number
    r"[%9.]*"               # % or OCR artifacts like trailing "9."
    r"\s*$"                 # end of line
)

# Lines that are parenthetical descriptions — skip these
_PAREN_RE = re.compile(r"^\(")

# Fund name patterns in the title block
# OCR commonly misreads letters: FIREMEN→FIRENIEN, RELIEF→REUEF, etc.
_FUND_RE = re.compile(
    r"(FI\w+.S\s+RE\w+\s+AND\s+PENSION\s+FUND"
    r"|MUNICIPAL\s+PENSION\s+FUND"
    r"|PO\w+.S\s+RE\w+\s+AND\s+PENSION\s+FUND)",
    re.IGNORECASE,
)

# Lines to skip entirely
_SKIP_PATTERNS = [
    re.compile(r"^CITY OF PITTSBURGH", re.IGNORECASE),
    re.compile(r"WORKSHEET FOR", re.IGNORECASE),
    re.compile(r"Signature", re.IGNORECASE),
    re.compile(r"September|Date Certified|Governing Body", re.IGNORECASE),
    re.compile(r"^Note:", re.IGNORECASE),
    re.compile(r"Actuarial Valuation", re.IGNORECASE),
]

# "$ 0" rendered as various OCR noise: "s o", "s oO", "s 0", "§ 0",
# "$ ie)", etc.
_ZERO_RE = re.compile(
    rf"\s*{_DOLLAR_CHARS}+\s*([oO0]|ie\)?)+\s*$"
)

# Minimum upscale factor for native images (pixels per PDF point).
# Native images are often low-res (~1 px/pt); 3× gives ~720→2160 px wide,
# which is in the sweet spot for tesseract.
_MIN_UPSCALE_PX_PER_PT = 3


def _ocr_image_region(page: Page, dpi: int = 300) -> list[OcrWord]:
    """
    Extract words via OCR from the largest embedded image on a page.

    Prefers extracting the native embedded image via PyMuPDF (avoids
    re-rasterization artifacts).  Falls back to rendering the page at
    the given DPI if native extraction fails.  The image is upscaled
    and converted to grayscale before OCR for best accuracy.
    """
    import pytesseract
    from PIL import Image

    if not page.images:
        return []

    # Find the largest image by area (in PDF-point space)
    largest = max(
        page.images,
        key=lambda img: (img["x1"] - img["x0"]) * (img["bottom"] - img["top"]),
    )

    pdf_w = largest["x1"] - largest["x0"]
    pdf_h = largest["bottom"] - largest["top"]

    # ── Try native image extraction via PyMuPDF ──────────────────────
    # Native extraction avoids re-rasterization artifacts that degrade OCR.
    pil_img: Optional[Image.Image] = None
    try:
        import fitz
        import io as _io

        pdf_path = page.pdf.stream.name
        doc = fitz.open(pdf_path)
        mu_page = doc[page.page_number - 1]
        images = mu_page.get_images(full=True)
        if images:
            xref = images[0][0]
            base = doc.extract_image(xref)
            pil_img = Image.open(_io.BytesIO(base["image"]))
        doc.close()
    except Exception:
        pil_img = None

    # ── Fallback: render via pdfplumber ──────────────────────────────
    if pil_img is None:
        page_img = page.to_image(resolution=dpi)
        scale = dpi / 72
        px_x0 = int(largest["x0"] * scale)
        px_y0 = int(largest["top"] * scale)
        px_x1 = int(largest["x1"] * scale)
        px_y1 = int(largest["bottom"] * scale)
        pil_img = page_img.original.crop((px_x0, px_y0, px_x1, px_y1))

    # ── Upscale small images and convert to grayscale ────────────────
    px_per_pt = pil_img.width / pdf_w
    if px_per_pt < _MIN_UPSCALE_PX_PER_PT:
        factor = int(_MIN_UPSCALE_PX_PER_PT / px_per_pt) + 1
        pil_img = pil_img.resize(
            (pil_img.width * factor, pil_img.height * factor), Image.LANCZOS
        )

    grayscale = pil_img.convert("L")

    # Scale factor: pixels in final image → PDF points
    scale_x = grayscale.width / pdf_w
    scale_y = grayscale.height / pdf_h

    # Run OCR
    data = pytesseract.image_to_data(
        grayscale, output_type=pytesseract.Output.DICT, config="--psm 6"
    )

    words: list[OcrWord] = []
    for i in range(len(data["text"])):
        txt = data["text"][i].strip()
        if not txt:
            continue

        # Convert pixel coords back to PDF points, offset by image origin
        words.append(
            OcrWord(
                text=txt,
                x0=largest["x0"] + data["left"][i] / scale_x,
                y0=largest["top"] + data["top"][i] / scale_y,
                x1=largest["x0"] + (data["left"][i] + data["width"][i]) / scale_x,
                y1=largest["top"] + (data["top"][i] + data["height"][i]) / scale_y,
                confidence=int(data["conf"][i]),
            )
        )

    return words


def _reconstruct_lines(words: list[OcrWord], y_tolerance: float = 5.0) -> list[str]:
    """
    Group OCR words into text lines by y-position, then join each line's
    words left-to-right.
    """
    if not words:
        return []

    # Cluster by y midpoint
    sorted_words = sorted(words, key=lambda w: (w.y0, w.x0))
    lines: list[list[OcrWord]] = []
    current_line: list[OcrWord] = [sorted_words[0]]
    current_y = sorted_words[0].y0

    for w in sorted_words[1:]:
        if abs(w.y0 - current_y) <= y_tolerance:
            current_line.append(w)
        else:
            lines.append(sorted(current_line, key=lambda w: w.x0))
            current_line = [w]
            current_y = w.y0
    lines.append(sorted(current_line, key=lambda w: w.x0))

    return [" ".join(w.text for w in line) for line in lines]


def _is_mmo_worksheet(lines: list[str]) -> bool:
    """Check whether OCR lines look like an MMO pension worksheet."""
    text = "\n".join(lines)
    has_worksheet = bool(re.search(r"WORKSHEET\s+FOR\s+\d{4}\s+MMO", text, re.IGNORECASE))
    has_fund = bool(_FUND_RE.search(text))
    has_items = sum(1 for ln in lines if _ITEM_RE.match(ln.strip())) >= 5
    return has_worksheet and (has_fund or has_items)


def _clean_number(raw: str) -> str:
    """
    Clean an OCR'd numeric value: fix internal spaces and stray punctuation.

    Examples:
        "15,892 782" → "15,892,782"
        "151,612, 788" → "151,612,788"
    """
    # Remove spaces around commas: "612, 788" → "612,788"
    cleaned = re.sub(r",\s+", ",", raw)
    # Insert missing comma between digit groups separated by space
    cleaned = re.sub(r"(\d),?(\s+)(\d{3})\b", r"\1,\3", cleaned)
    return cleaned


def _parse_mmo_lines(lines: list[str]) -> tuple[str, list[tuple[str, str]]]:
    """
    Parse MMO worksheet lines into (fund_name, [(label, value), ...]).

    Returns the fund name and a list of (item_label, item_value) tuples
    for the 9 numbered line items.
    """
    fund_name = ""
    items: list[tuple[str, str]] = []

    for line in lines:
        line = line.strip()

        # Extract fund name from title
        fund_match = _FUND_RE.search(line)
        if fund_match:
            fund_name = fund_match.group(1).title()
            continue

        # Skip non-data lines
        if any(pat.search(line) for pat in _SKIP_PATTERNS):
            continue
        if _PAREN_RE.match(line):
            continue
        if not line:
            continue

        # Try to parse a numbered item
        item_match = _ITEM_RE.match(line)
        if not item_match:
            continue

        item_num = item_match.group(1)
        rest = item_match.group(2)

        # Check for $0 patterns first (most error-prone in OCR)
        if _ZERO_RE.search(rest):
            label = _ZERO_RE.sub("", rest).strip()
            label = re.sub(r"[.\s]+$", "", label)
            items.append((f"{item_num}. {label}", "$0"))
            continue

        # Try dollar value
        dollar_match = _DOLLAR_VALUE_RE.search(rest)
        if dollar_match:
            raw_value = _clean_number(dollar_match.group(1))
            value = f"${raw_value}"
            label = rest[: dollar_match.start()].strip()
            # Clean trailing dots/periods and dollar-like chars from OCR artifacts
            label = re.sub(rf"[.\s{_DOLLAR_CHARS[1:-1]}]+$", "", label)
            items.append((f"{item_num}. {label}", value))
            continue

        # Try percentage — must have digits with decimal point before % or end
        # The label for percentage items never contains digits, so we can split
        # at the last word boundary before the number
        pct_match = _PERCENT_VALUE_RE.search(rest)
        if pct_match:
            value = f"{pct_match.group(1)}%"
            label = rest[: pct_match.start()].strip()
            label = re.sub(r"[.\s]+$", "", label)
            items.append((f"{item_num}. {label}", value))
            continue

        # Fallback: no value parsed
        items.append((f"{item_num}. {rest.strip()}", ""))

    return fund_name, items


def extract_mmo_tables(page: Page) -> list[SpatialTable]:
    """
    Extract MMO pension worksheet tables from an image-based PDF page.

    Returns a list of SpatialTable objects (0 or 1 per page) matching
    the same interface as SpatialTableExtractor.extract_tables().
    """
    if not is_image_page(page):
        return []

    words = _ocr_image_region(page)
    if not words:
        return []

    lines = _reconstruct_lines(words)
    if not _is_mmo_worksheet(lines):
        return []

    fund_name, items = _parse_mmo_lines(lines)
    if not items:
        return []

    # Build a SpatialTable with 2 columns: Item, Value
    page_width = float(page.width)
    col_label = SpatialColumn(x0=0, x1=page_width * 0.7, alignment="left", header="Item")
    col_value = SpatialColumn(
        x0=page_width * 0.7, x1=page_width, alignment="right", header="Value"
    )

    rows = [
        SpatialRow(y0=float(i), y1=float(i + 1), cells=[label, value])
        for i, (label, value) in enumerate(items)
    ]

    table = SpatialTable(
        columns=[col_label, col_value],
        rows=rows,
        headers=["Item", "Value"],
        bbox=(0, 0, page_width, float(page.height)),
    )

    return [table]
