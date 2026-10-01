"""Tests for `_merge_continuation_tables` band-detection between in-page sub-tables.

Specifically: when a colored band visually wraps the next table's row, it should
prevent merging — even though the band extends past the gap into the next row.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.spatial_table_extractor import (
    SpatialColumn,
    SpatialRow,
    SpatialTable,
    SpatialTableExtractor,
)


def _table(bbox: tuple[float, float, float, float], rows: list[list[str]],
           headers: list[str]) -> SpatialTable:
    cols = [
        SpatialColumn(x0=bbox[0], x1=bbox[2] / 2, alignment="left"),
        SpatialColumn(x0=bbox[2] / 2, x1=bbox[2], alignment="right"),
    ]
    return SpatialTable(
        columns=cols,
        rows=[SpatialRow(y0=bbox[1], y1=bbox[3], cells=r) for r in rows],
        bbox=bbox,
        headers=headers,
    )


def test_band_wrapping_next_row_blocks_continuation_merge():
    # Detail table ends at y=362.5; banded "Total" row sits at y=367.8-376.5;
    # the band wraps that row (365.5-378.4), starting in the gap but extending
    # past the next table's top.
    detail = _table(
        (74.0, 155.3, 534.0, 362.5),
        rows=[["Project A", "100"], ["Total: Foo", "100"]],
        headers=["Functional Area: Foo", ""],
    )
    grand = _table(
        (74.0, 367.8, 534.0, 376.5),
        rows=[["Total: All Functional Areas", "100,870,205"]],
        headers=["Functional Area: Foo", ""],
    )

    ext = SpatialTableExtractor()
    bg_bands = [(365.5, 378.4)]  # band wraps the grand-total row
    out = ext._merge_continuation_tables([detail, grand], bg_bands)

    assert len(out) == 2, "banded summary row should not be merged into detail table"


def test_no_band_between_continuation_tables_still_merges():
    # Same headers, summary-only next, no band overlapping the gap → merge.
    detail = _table(
        (74.0, 155.3, 534.0, 362.5),
        rows=[["Position 1", "1"]],
        headers=["Position", "FTE"],
    )
    summary = _table(
        (74.0, 367.8, 534.0, 376.5),
        rows=[["Total Full-Time", "5"]],
        headers=["Position", "FTE"],
    )

    ext = SpatialTableExtractor()
    out = ext._merge_continuation_tables([detail, summary], bg_bands=[])

    assert len(out) == 1
    assert len(out[0].rows) == 2
