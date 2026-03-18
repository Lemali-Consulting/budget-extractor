"""Tests for merge_consecutive_tables in build_web_data."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_web_data import merge_consecutive_tables


def _table(id: str, page: int, table_type: str, headers: list[str],
           rows: list[list[str]], sections: list[str] | None = None) -> dict:
    t = {
        "id": id,
        "relative_page": page,
        "table_index": 0,
        "table_type": table_type,
        "headers": headers,
        "rows": rows,
    }
    if sections is not None:
        t["sections"] = sections
    return t


GRANT_HEADERS = ["Department", "JDE Number", "Funder", "Grant",
                 "Amount Awarded", "Amount Spent", "Remaining Balance"]

PERSONNEL_HEADERS = ["Title", "2025 FTE", "Rate/ Grade", "Hours/ Months",
                     "2026 FTE", "Rate/ Grade"]


class TestMergeConsecutiveTables:
    """Consecutive tables with identical headers and type should merge."""

    def test_same_headers_merge(self):
        tables = [
            _table("s58_p2_t0", 2, "grant", GRANT_HEADERS, [["A"] * 7, ["B"] * 7]),
            _table("s58_p2_t1", 2, "grant", GRANT_HEADERS, [["C"] * 7]),
            _table("s58_p3_t0", 3, "grant", GRANT_HEADERS, [["D"] * 7]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 1
        assert len(result[0]["rows"]) == 4

    def test_different_type_no_merge(self):
        tables = [
            _table("t1", 2, "grant", GRANT_HEADERS, [["A"] * 7]),
            _table("t2", 2, "personnel", PERSONNEL_HEADERS, [["X"] * 6]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 2

    def test_different_headers_no_merge(self):
        tables = [
            _table("t1", 2, "grant", GRANT_HEADERS, [["A"] * 7]),
            _table("t2", 3, "grant", ["Col1", "Col2"], [["X", "Y"]]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 2

    def test_sections_merged(self):
        tables = [
            _table("t1", 2, "grant", GRANT_HEADERS, [["A"] * 7, ["B"] * 7],
                   sections=["Dept A", "Dept A"]),
            _table("t2", 3, "grant", GRANT_HEADERS, [["C"] * 7],
                   sections=["Dept B"]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 1
        assert result[0]["sections"] == ["Dept A", "Dept A", "Dept B"]

    def test_keeps_first_id_and_page(self):
        tables = [
            _table("s58_p2_t0", 2, "grant", GRANT_HEADERS, [["A"] * 7]),
            _table("s58_p5_t0", 5, "grant", GRANT_HEADERS, [["B"] * 7]),
        ]
        result = merge_consecutive_tables(tables)
        assert result[0]["id"] == "s58_p2_t0"
        assert result[0]["relative_page"] == 2

    def test_non_consecutive_different_type_breaks_run(self):
        """A table of different type in between prevents merging."""
        tables = [
            _table("t1", 2, "grant", GRANT_HEADERS, [["A"] * 7]),
            _table("t2", 3, "personnel", PERSONNEL_HEADERS, [["X"] * 6]),
            _table("t3", 4, "grant", GRANT_HEADERS, [["B"] * 7]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 3

    def test_empty_list(self):
        assert merge_consecutive_tables([]) == []

    def test_single_table(self):
        tables = [_table("t1", 2, "grant", GRANT_HEADERS, [["A"] * 7])]
        result = merge_consecutive_tables(tables)
        assert len(result) == 1

    def test_personnel_tables_not_merged(self):
        """Personnel tables are per-program and should NOT merge."""
        tables = [
            _table("t1", 10, "personnel", PERSONNEL_HEADERS, [["A"] * 6]),
            _table("t2", 10, "personnel", PERSONNEL_HEADERS, [["B"] * 6]),
            _table("t3", 11, "personnel", PERSONNEL_HEADERS, [["C"] * 6]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 3

    def test_financial_summary_excluded(self):
        """Financial summary tables should NOT be merged even with same headers."""
        headers = ["Expenditures", "2024 Actual", "2025 Budget", "2026 Budget"]
        tables = [
            _table("t1", 2, "financial_summary", headers, [["Revenue", "1", "2", "3"]]),
            _table("t2", 3, "financial_summary", headers, [["Expense", "4", "5", "6"]]),
        ]
        result = merge_consecutive_tables(tables)
        assert len(result) == 2
