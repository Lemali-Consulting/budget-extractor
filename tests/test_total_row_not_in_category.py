"""Tests that a table's total row does not keep the category above it alive as a section header."""
from utils.spatial_table_extractor import SpatialColumn, SpatialRow, SpatialTable, assign_sections

# The 2027 revenue summary lists one row per revenue category (41 - Tax Revenue
# ... 48 - Miscellaneous Revenues) and ends with "Total Revenues". With no line
# items under any category, none of them heads a group. The total row, which
# belongs to the whole table, was counted as part of the last category, so
# "48 - Miscellaneous Revenues" alone was drawn as a group heading (Public
# Source's fact-check, Rich's sheet "1126", row 18; the expenditure summary's
# "82 - Debt Service" had the same fault).
CATEGORY_ONLY_ROWS: list[list[str]] = [
    ["45 - Intergovernmental Revenues", "50,580,439", "52,430,411"],
    ["47 - Interest Earnings", "3,902,141", "3,254,464"],
    ["48 - Miscellaneous Revenues", "120,500", "122,800"],
    ["Total Revenues", "698,771,868", "713,989,667"],
]

# A department financial summary prints each category above its line items;
# there the category is a real group heading and its rows stay under it.
CATEGORY_WITH_LINE_ITEMS: list[list[str]] = [
    ["56 - SUPPLIES", "19,030", "22,000"],
    ["56101 - Office Supplies", "854", "1,000"],
    ["56151 - Operational Supplies", "18,176", "21,000"],
    ["Expenditures Total", "812,819", "58,000"],
]


def _table(rows: list[list[str]]) -> SpatialTable:
    """A three-column table holding the given rows."""
    columns: list[SpatialColumn] = [
        SpatialColumn(x0=0, x1=100, alignment="left"),
        SpatialColumn(x0=100, x1=150, alignment="right"),
        SpatialColumn(x0=150, x1=200, alignment="right"),
    ]
    return SpatialTable(
        columns=columns,
        rows=[SpatialRow(y0=i * 10, y1=i * 10 + 8, cells=cells) for i, cells in enumerate(rows)],
    )


def test_last_category_before_the_total_heads_no_group() -> None:
    """In a table of categories alone, no row (the last one included) is a group heading."""
    assert assign_sections(_table(CATEGORY_ONLY_ROWS)) == ["", "", "", ""]


def test_category_over_its_line_items_still_heads_a_group() -> None:
    """A category with line items under it keeps them grouped beneath it."""
    sections: list[str] = assign_sections(_table(CATEGORY_WITH_LINE_ITEMS))

    assert sections[:3] == ["56 - SUPPLIES"] * 3
