"""Tests that header-derived columns keep propagating past a narrower subtotal row to the tables below it."""
import re
from pathlib import Path

import pdfplumber

from utils.paths import variant_paths
from utils.spatial_table_extractor import SpatialTableExtractor

# 2027 proposed Revenue Summary, "Revenue by Tax" page (1-based page 13). The
# CAGR column sits only ~15pt right of the 2031 amounts; the tax rows get it
# from the header, the non-tax rows below the "Major Tax Revenue" subtotal must
# inherit it rather than merging "54,790,510 1.2 %" into one cell.
REVENUE_BY_TAX_PAGE_INDEX: int = 12
AMOUNT_THEN_PERCENT: re.Pattern[str] = re.compile(r"\d[\d,]*\s+\(?[\d.—]+\)?\s*%")


def _revenue_by_tax_cells() -> list[str]:
    """All cell texts extracted from the 2027 proposed Revenue by Tax page."""
    pdf_path: Path = variant_paths(year=2027, budget_type="operating", variant="proposed").pdf
    with pdfplumber.open(pdf_path) as pdf:
        tables = SpatialTableExtractor().extract_tables(pdf.pages[REVENUE_BY_TAX_PAGE_INDEX])
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
