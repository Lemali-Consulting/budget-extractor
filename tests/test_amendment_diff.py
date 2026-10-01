"""Tests for the adopted-vs-amended diff logic in build_amendment_diff.py."""
import importlib.util
import types


def _import(name: str, path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _mod() -> types.ModuleType:
    return _import("build_amendment_diff", "scripts/build_amendment_diff.py")


# Header layout used by the operating financial_summary tables.
FIN_HEADERS = ["", "2024 Actual", "2025 Budget", "2026 Budget",
               "Increase/ (Decrease)", "% Change"]


def _fin_table(table_id: str, rows: list[list[str]]) -> dict:
    return {"id": table_id, "table_type": "financial_summary",
            "headers": list(FIN_HEADERS), "rows": rows}


def test_parse_amount() -> None:
    m = _mod()
    assert m.parse_amount("2,901,384") == 2901384.0
    assert m.parse_amount("$1,234,567") == 1234567.0
    assert m.parse_amount("—") is None
    assert m.parse_amount("") is None
    assert m.parse_amount("varies") is None


def test_diff_table_emits_changed_budget_year_cell() -> None:
    m = _mod()
    adopted = _fin_table("s10_p3_t0", [
        ["51 - PERSONNEL-SALARIES & WAGES", "2,605,908", "2,778,838", "2,778,838", "0", "0%"],
    ])
    amended = _fin_table("s10_p3_t0", [
        ["51 - PERSONNEL-SALARIES & WAGES", "2,605,908", "2,778,838", "2,901,384", "122,546", "4.4%"],
    ])
    diff = m.diff_table(adopted, amended, year=2026)
    assert "51 - PERSONNEL-SALARIES & WAGES" in diff
    cell = diff["51 - PERSONNEL-SALARIES & WAGES"]["2026 Budget"]
    assert cell["adopted"] == 2778838.0
    assert cell["amended"] == 2901384.0
    assert cell["delta"] == 122546.0
    assert round(cell["pct"], 1) == 4.4


def test_diff_table_ignores_unchanged_and_derived_columns() -> None:
    m = _mod()
    # 2024 Actual / 2025 Budget identical; only 2026 Budget changes.
    adopted = _fin_table("t", [["A", "10", "20", "30", "0", "0%"]])
    amended = _fin_table("t", [["A", "10", "20", "35", "5", "16.7%"]])
    diff = m.diff_table(adopted, amended, year=2026)
    # Only the 2026 Budget column is reported (not the derived Increase/% columns,
    # not the unchanged historical columns).
    assert set(diff["A"].keys()) == {"2026 Budget"}


def test_diff_table_identical_returns_empty() -> None:
    m = _mod()
    t = _fin_table("t", [["A", "10", "20", "30", "0", "0%"]])
    assert m.diff_table(t, dict(t), year=2026) == {}


def test_row_matching_survives_reordering() -> None:
    m = _mod()
    adopted = _fin_table("t", [
        ["A", "1", "1", "100", "", ""],
        ["B", "1", "1", "200", "", ""],
    ])
    amended = _fin_table("t", [
        ["B", "1", "1", "250", "", ""],   # reordered, changed
        ["A", "1", "1", "100", "", ""],   # unchanged
    ])
    diff = m.diff_table(adopted, amended, year=2026)
    assert set(diff.keys()) == {"B"}
    assert diff["B"]["2026 Budget"]["amended"] == 250.0


def test_inserted_and_empty_label_rows_are_safe() -> None:
    m = _mod()
    adopted = _fin_table("t", [["A", "1", "1", "100", "", ""]])
    amended = _fin_table("t", [
        ["A", "1", "1", "100", "", ""],
        ["", "1", "1", "999", "", ""],     # empty label -> skipped
        ["C", "1", "1", "500", "", ""],    # new row, no adopted match -> skipped
    ])
    assert m.diff_table(adopted, amended, year=2026) == {}


def test_added_funding_from_dash() -> None:
    m = _mod()
    adopted = _fin_table("t", [["51103 - Part Time", "—", "26,000", "—", "", ""]])
    amended = _fin_table("t", [["51103 - Part Time", "—", "26,000", "66,000", "", ""]])
    diff = m.diff_table(adopted, amended, year=2026)
    cell = diff["51103 - Part Time"]["2026 Budget"]
    assert cell["adopted"] in (0, 0.0, None)
    assert cell["amended"] == 66000.0
    assert cell["delta"] == 66000.0
    assert cell["pct"] is None  # undefined when adopted is zero/None


def test_fallback_diffs_numeric_cols_when_no_year_header() -> None:
    m = _mod()
    # Trust-fund-style balance table: no year in headers, value still changes.
    adopted = {"id": "b", "table_type": "fund_balance",
               "headers": ["", ""], "rows": [["Projected Ending Balance", "1,409,142"]]}
    amended = {"id": "b", "table_type": "fund_balance",
               "headers": ["", ""], "rows": [["Projected Ending Balance", "908,878"]]}
    diff = m.diff_table(adopted, amended, year=2026)
    assert "Projected Ending Balance" in diff


def test_build_department_changes() -> None:
    m = _mod()
    adopted_dept = [
        {"department": "City Council", "slug": "city-council", "year": "2026 Budget", "amount": 3700000.0, "fund": "operating"},
        {"department": "Police", "slug": "police", "year": "2026 Budget", "amount": 1000000.0, "fund": "operating"},
    ]
    amended_dept = [
        {"department": "City Council", "slug": "city-council", "year": "2026 Budget", "amount": 3709073.0, "fund": "operating"},
        {"department": "Police", "slug": "police", "year": "2026 Budget", "amount": 900000.0, "fund": "operating"},
    ]
    changes = m.build_department_changes(adopted_dept, amended_dept, year=2026)
    by_slug = {c["slug"]: c for c in changes["departmentChanges"]}
    assert by_slug["city-council"]["dollarChange"] == 9073.0
    assert by_slug["police"]["dollarChange"] == -100000.0
    assert changes["totalBudgetAdopted"] == 4700000.0
    assert changes["totalBudgetAmended"] == 4609073.0
    # top increases/decreases are sorted by magnitude
    assert changes["topIncreases"][0]["slug"] == "city-council"
    assert changes["topDecreases"][0]["slug"] == "police"


def test_bundle_paths_read_year_prefixed_amended_and_adopted_baseline() -> None:
    from pathlib import Path

    m = _mod()
    paths = m.bundle_paths(year=2026, data_dir=Path("/d"))
    assert paths.amended_bundle == Path("/d/2026-budget-data.json")
    assert paths.amended_departments == Path("/d/views/2026-department-budgets.json")
    assert paths.amended_personnel == Path("/d/views/2026-personnel.json")
    assert paths.adopted_bundle == Path("/d/adopted-budget-data.json")
    assert paths.adopted_departments == Path("/d/views/adopted-department-budgets.json")
    assert paths.adopted_personnel == Path("/d/views/adopted-personnel.json")
