"""Tests that a data row with a blank amount is not mistaken for a section header that relabels the rows after it."""
from pathlib import Path

import pdfplumber

from utils.paths import variant_paths
from utils.spatial_table_extractor import SpatialTable, SpatialTableExtractor, assign_sections

# 2027 Mayor's capital budget (Nov 9), "2027 Project Summary" page for
# Neighborhood and Community Development (1-based page 18). Housing Development
# has no 2027 funding and, unlike the September edition, prints no "-" in its
# amount column. It is one project among its siblings, not a heading over the
# projects listed after it.
PROJECT_SUMMARY_PAGE_INDEX: int = 17
FIRST_PROJECT: str = "125BEDFORD DWELLINGS CHOICE NEIGHBORHOOD"


def _neighborhood_summary_table() -> SpatialTable:
    """The Neighborhood and Community Development project summary table."""
    pdf_path: Path = variant_paths(year=2027, budget_type="capital", variant="proposed").pdf
    with pdfplumber.open(pdf_path) as pdf:
        tables: list[SpatialTable] = SpatialTableExtractor().extract_tables(pdf.pages[PROJECT_SUMMARY_PAGE_INDEX])
    return next(t for t in tables if t.rows and t.rows[0].cells[0] == FIRST_PROJECT)


def test_blank_amount_row_after_data_rows_opens_no_section() -> None:
    """Rows listed after an unfunded project carry no section label."""
    sections: list[str] = assign_sections(_neighborhood_summary_table())

    assert set(sections) == {""}
