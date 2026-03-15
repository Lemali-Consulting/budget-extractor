"""Tests for merge_continuation_tables handling of repeated headers."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from utils.spatial_table_extractor import (
    SpatialColumn, SpatialRow, SpatialTable, SpatialTableExtractor,
)


def _make_cols(xs: list[tuple[float, float]]) -> list[SpatialColumn]:
    return [SpatialColumn(x0=x0, x1=x1, alignment="right") for x0, x1 in xs]


COL_SPEC_A = [(56, 228), (228, 317), (317, 379), (379, 441), (441, 504), (504, 557)]
# Slightly shifted columns (mimics real PDFs where word widths vary per page)
COL_SPEC_B = [(56, 233), (233, 322), (322, 384), (384, 446), (446, 509), (509, 557)]
HEADERS = ["Account", "2026", "2027", "2028", "2029", "2030"]


def _table(headers: list[str], rows: list[list[str]],
           col_spec: list[tuple[float, float]] | None = None) -> SpatialTable:
    cols = _make_cols(col_spec or COL_SPEC_A)
    return SpatialTable(
        columns=cols,
        rows=[SpatialRow(y0=0, y1=0, cells=r) for r in rows],
        headers=headers,
    )


class TestMergeRepeatedHeaders:
    """Tables with identical headers across pages should merge."""

    def test_repeated_headers_merge(self):
        """P0T0 and P1T0 with same headers merge even with shifted columns."""
        page_tables = {
            0: [_table(HEADERS, [["41101", "100", "200", "300", "400", "500"]], COL_SPEC_A)],
            1: [_table(HEADERS, [["42318", "110", "210", "310", "410", "510"]], COL_SPEC_B)],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        # Page 0 table should have both rows
        assert len(result[0]) == 1
        merged = result[0][0]
        assert len(merged.rows) == 2
        assert merged.rows[0].cells[0] == "41101"
        assert merged.rows[1].cells[0] == "42318"

        # Page 1 should have no tables (merged away)
        assert len(result.get(1, [])) == 0

    def test_repeated_headers_merge_three_pages(self):
        """Three consecutive pages with same headers merge into one."""
        page_tables = {
            0: [_table(HEADERS, [["row0"]], COL_SPEC_A)],
            1: [_table(HEADERS, [["row1"]], COL_SPEC_B)],
            2: [_table(HEADERS, [["row2"]], COL_SPEC_A)],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        merged = result[0][0]
        assert len(merged.rows) == 3
        assert [r.cells[0] for r in merged.rows] == ["row0", "row1", "row2"]
        assert len(result.get(1, [])) == 0
        assert len(result.get(2, [])) == 0

    def test_different_headers_no_merge(self):
        """Tables with different headers should NOT merge."""
        page_tables = {
            0: [_table(HEADERS, [["row0"]])],
            1: [_table(["Name", "A", "B", "C", "D", "E"], [["row1"]])],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        assert len(result[0]) == 1
        assert len(result[1]) == 1
        assert len(result[0][0].rows) == 1
        assert len(result[1][0].rows) == 1

    def test_repeated_header_not_added_as_data_row(self):
        """The repeated header should be dropped, not added as a data row."""
        page_tables = {
            0: [_table(HEADERS, [["row0", "1", "2", "3", "4", "5"]], COL_SPEC_A)],
            1: [_table(HEADERS, [["row1", "6", "7", "8", "9", "10"]], COL_SPEC_B)],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        merged = result[0][0]
        # Should have exactly 2 data rows, not 3 (header should not become a row)
        assert len(merged.rows) == 2
        # Headers should remain the original
        assert merged.headers == HEADERS

    def test_existing_empty_header_merge_still_works(self):
        """Original behavior: empty-header continuations still merge."""
        page_tables = {
            0: [_table(HEADERS, [["row0"]])],
            1: [_table(["", "", "", "", "", ""], [["row1"]])],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        merged = result[0][0]
        assert len(merged.rows) == 2

    def test_existing_dollar_header_merge_still_works(self):
        """Original behavior: dollar-value headers (data rows) still merge."""
        page_tables = {
            0: [_table(HEADERS, [["row0", "$100", "$200", "$300", "$400", "$500"]])],
            1: [_table(["row1", "$110", "$210", "$310", "$410", "$510"], [["row2"]])],
        }

        result = SpatialTableExtractor.merge_continuation_tables(page_tables)

        merged = result[0][0]
        # Dollar-header row becomes a data row + the actual data row
        assert len(merged.rows) == 3
