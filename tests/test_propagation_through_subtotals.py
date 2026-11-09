"""Tests that header-derived columns keep propagating past a narrower subtotal row to the tables below it."""
import re
from pathlib import Path

import pdfplumber

from utils.spatial_table_extractor import SpatialTableExtractor

# September 2027 preliminary Revenue Summary, "Revenue by Tax" page (page 13 of
# that PDF, kept as a one-page fixture since the November document dropped this
# table). The
# CAGR column sits only ~15pt right of the 2031 amounts; the tax rows get it
# from the header, the non-tax rows below the "Major Tax Revenue" subtotal must
# inherit it rather than merging "54,790,510 1.2 %" into one cell.
REVENUE_BY_TAX_PDF: Path = Path(__file__).parent / "fixtures" / "sept-2027-revenue-by-tax.pdf"
AMOUNT_THEN_PERCENT: re.Pattern[str] = re.compile(r"\d[\d,]*\s+\(?[\d.—]+\)?\s*%")


def _revenue_by_tax_cells() -> list[str]:
    """All cell texts extracted from the September 2027 Revenue by Tax page."""
    with pdfplumber.open(REVENUE_BY_TAX_PDF) as pdf:
        tables = SpatialTableExtractor().extract_tables(pdf.pages[0])
    return [cell for t in tables for row in t.rows for cell in row.cells]


def test_non_tax_rows_keep_cagr_in_its_own_column() -> None:
    """No extracted cell holds an amount and a growth percentage together."""
    merged: list[str] = [c for c in _revenue_by_tax_cells() if AMOUNT_THEN_PERCENT.search(c)]

    assert merged == []


def test_non_tax_cagr_values_are_extracted_as_cells() -> None:
    """The non-tax CAGR values appear as standalone cells."""
    cells: list[str] = _revenue_by_tax_cells()

    assert "1.2 %" in cells
    assert "1.7 %" in cells
