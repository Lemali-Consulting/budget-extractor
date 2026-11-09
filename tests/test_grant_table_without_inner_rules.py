"""Tests that grant tables drawn without inner column rules still split into their seven columns."""
from pathlib import Path

import pdfplumber

from utils.paths import variant_paths
from utils.spatial_table_extractor import SpatialTable, SpatialTableExtractor

# 2027 Mayor's operating budget (Nov 9), Grants section, 1-based page 299
# (Department of Public Works). Unlike the grant pages around it, this page
# draws only the table's outer border and none of the rules between columns,
# yet its columns sit where every other grant page puts them.
RULELESS_GRANT_PAGE_INDEX: int = 298
GRANT_HEADERS: list[str] = [
    "Department", "JDE Number", "Funder", "Grant",
    "Amount Awarded", "Amount Spent", "Remaining Balance",
]


def _ruleless_grant_tables() -> list[SpatialTable]:
    """The grant tables on the page that has no inner column rules."""
    pdf_path: Path = variant_paths(year=2027, budget_type="operating", variant="proposed").pdf
    with pdfplumber.open(pdf_path) as pdf:
        return SpatialTableExtractor().extract_tables(pdf.pages[RULELESS_GRANT_PAGE_INDEX])


def test_grant_rows_split_into_all_columns_when_the_page_draws_no_inner_rules() -> None:
    """Each grant row gives its JDE number, funder, grant and three amounts their own cells."""
    tables: list[SpatialTable] = _ruleless_grant_tables()
    homewood = next(r.cells for t in tables for r in t.rows if "Homewood" in " ".join(r.cells))

    assert tables[0].headers == GRANT_HEADERS
    assert homewood == [
        "Department of Public Works",
        "4029400338",
        "Redevelopment Assistance Capital Program",
        "Homewood Park Grant",
        "1,500,000",
        "1,500,000",
        "—",
    ]
