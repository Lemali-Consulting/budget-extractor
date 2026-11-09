"""Tests that a total row split off by a rule on a headerless continuation page rejoins the table in its columns."""
from pathlib import Path

import pdfplumber

from utils.paths import variant_paths
from utils.spatial_table_extractor import SpatialTable, SpatialTableExtractor

# September 2027 preliminary Revenue Detail, last page (page 17 of that PDF,
# kept as a one-page fixture since the November document replaced it): a
# headerless continuation of the account table, then "Total Revenue" below a
# rule. The five totals sit closer together than the column gap threshold, so
# on their own they collapse into a single cell.
REVENUE_DETAIL_LAST_PAGE_PDF: Path = Path(__file__).parent / "fixtures" / "sept-2027-revenue-detail-last-page.pdf"
LAST_ACCOUNT_ROW: str = "48303 - Proceeds from Lobbyist Register"
TOTAL_ROW: list[str] = [
    "Total Revenue", "701,793,104", "717,589,345", "725,161,727", "732,370,309", "739,480,902",
]


def _last_page_tables() -> list[SpatialTable]:
    """Tables extracted from the last Revenue Detail page."""
    with pdfplumber.open(REVENUE_DETAIL_LAST_PAGE_PDF) as pdf:
        return SpatialTableExtractor().extract_tables(pdf.pages[0])


def test_total_row_joins_the_account_table() -> None:
    """The Total Revenue row ends the same table as the last account row."""
    tables: list[SpatialTable] = _last_page_tables()
    owner: list[SpatialTable] = [
        t for t in tables if any(r.cells and r.cells[0] == LAST_ACCOUNT_ROW for r in t.rows)
    ]

    assert len(owner) == 1
    assert owner[0].rows[-1].cells[0] == "Total Revenue"


def test_total_row_values_land_in_year_columns() -> None:
    """Each year's total is its own cell, aligned with the account columns."""
    tables: list[SpatialTable] = _last_page_tables()
    totals: list[list[str]] = [
        r.cells for t in tables for r in t.rows if r.cells and r.cells[0] == "Total Revenue"
    ]

    assert totals == [TOTAL_ROW]


# 2026 adopted Parks and Recreation (1-based page 233): the seasonal-allowance
# table above the totals block has no Title column, so the block's labels sit
# left of every column. Re-slotting it there would drop the labels.
PARKS_2026_TOTALS_PAGE_INDEX: int = 232
PARKS_TOTAL_LABEL: str = "Total Full-Time Permanent Positions"


def test_totals_block_keeps_labels_when_table_lacks_title_column() -> None:
    """A totals block whose labels lie outside the table's columns is not re-slotted."""
    pdf_path: Path = variant_paths(year=2026, budget_type="operating", variant="adopted").pdf
    with pdfplumber.open(pdf_path) as pdf:
        tables: list[SpatialTable] = SpatialTableExtractor().extract_tables(
            pdf.pages[PARKS_2026_TOTALS_PAGE_INDEX]
        )
    first_cells: list[str] = [r.cells[0] for t in tables for r in t.rows if r.cells]

    assert PARKS_TOTAL_LABEL in first_cells
