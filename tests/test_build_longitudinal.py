"""Tests for the longitudinal headline-figures builder: unit tests on fixture CSVs plus real-baseline checks."""
from __future__ import annotations

import importlib.util
import types
from pathlib import Path
from typing import Any

import pytest

from utils import paths

SCRIPT_PATH: Path = Path(__file__).resolve().parent.parent / "scripts" / "build_longitudinal.py"

FORECAST_FOLDER: str = "04_Five-Year_Financial_Forecast"
REVENUE_FOLDER: str = "05_Revenue_Summary"

SUMMARY_CSV: str = """\
"C0 (l, x:57-200)","C1 (r, x:200-260)","C2 (r, x:260-320)","C3 (r, x:320-380)",section
REVENUES,2025 Estimate,2026 Budget,2027 Forecast,section
Use of Fund Balance,—,"5,000",—,
Real Estate Tax,"100","(40)",—,
Total Revenues,"1,000","2,000","3,000",
EXPENDITURES,,,,EXPENDITURES
Salaries,"10","20","30",EXPENDITURES
Total Expenditures,"900","1,800","2,700",EXPENDITURES
OPERATING RESULT,"(5)",—,"7",EXPENDITURES
BEGINNING RESERVE FUND,,,,BEGINNING RESERVE FUND
BALANCE,"50","60","70",BEGINNING RESERVE FUND
Transfer to Technology Modernization,,,,BEGINNING RESERVE FUND
Fund,"(1)",—,—,BEGINNING RESERVE FUND
Fund,,,,Fund
ENDING RESERVE FUND BALANCE,"131","(38)","12",Fund
FUND BALANCE AS A % OF,,,,FUND BALANCE AS A % OF
EXPENDITURES,17.7 %,(4.9) %,28.0%,FUND BALANCE AS A % OF
"""

DEPARTMENT_CSV: str = """\
"C0 (l, x:57-210)","C1 (r, x:210-265)","C2 (r, x:265-310)","C3 (r, x:310-360)"
,2024 Actual,2025 Estimate,2026 Budget
Finance,"1","2","3"
Total Expenditures,"800","850","950"
"""

HISTORY_CSV: str = """\
"C0 (l, x:54-214)","C1 (r, x:214-271)","C2 (r, x:271-337)","C3 (r, x:337-402)"
,2023 Actual,2024 Actual,2025 Amended
Real Estate Tax,"11","12","13"
Other Taxes,(5),—,—
Total Revenues,"500","600","700"
Annual Growth Rate,(3.2)%,7.6%,11.0%
"""


@pytest.fixture(scope="module")
def mod() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("build_longitudinal", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module: types.ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_table(*, root: Path, year: int, subtype: str, folder: str, name: str, text: str) -> None:
    target: Path = root / "output" / "regression" / "expected" / str(year) / subtype / folder / f"{name}.csv"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def _fake_source_tree(root: Path, *, year: int, subtype: str, forecast_folder: str = FORECAST_FOLDER) -> None:
    _write_table(root=root, year=year, subtype=subtype, folder=forecast_folder, name="P1T0", text=SUMMARY_CSV)
    _write_table(root=root, year=year, subtype=subtype, folder=forecast_folder, name="P2T0", text=DEPARTMENT_CSV)
    _write_table(root=root, year=year, subtype=subtype, folder=REVENUE_FOLDER, name="P2T0", text=HISTORY_CSV)


def _find(records: list[dict[str, Any]], *, metric: str, fiscal_year: int, category: str | None = None,
          source_year: int | None = None) -> list[dict[str, Any]]:
    return [
        r for r in records
        if r["metric"] == metric and r["fiscalYear"] == fiscal_year and r["category"] == category
        and (source_year is None or r["sourceYear"] == source_year)
    ]


# ---------- parsing primitives ----------

@pytest.mark.parametrize(
    "header, doc_year, expected",
    [
        ("2024 Actual", 2026, (2024, "actual")),
        ("2026 Estimate", 2027, (2026, "estimate")),
        ("2027 Budget", 2027, (2027, "budget")),
        ("2024 Amended", 2025, (2024, "budget")),
        ("2028 Forecast", 2027, (2028, "forecast")),
        ("2028 Budget", 2027, (2028, "forecast")),
        ("2029 Estimate", 2027, (2029, "forecast")),
        ("CAGR*", 2027, None),
        ("", 2027, None),
        ("Budget", 2027, None),
    ],
)
def test_column_kind(mod: types.ModuleType, header: str, doc_year: int, expected: tuple[int, str] | None) -> None:
    column = mod.parse_year_column(header, doc_year)
    if expected is None:
        assert column is None
    else:
        assert (column.fiscal_year, column.kind) == expected


@pytest.mark.parametrize(
    "cell, expected",
    [("149,266,923", 149266923.0), ("(9,390)", -9390.0), ("—", 0.0), ("", None), ("n/a", None), ("1.9%", None)],
)
def test_parse_amount(mod: types.ModuleType, cell: str, expected: float | None) -> None:
    assert mod.parse_amount(cell) == expected


@pytest.mark.parametrize(
    "cell, expected",
    [("28.0%", 28.0), ("17.7 %", 17.7), ("(0.5)%", -0.5), ("(4.9) %", -4.9), ("", None), ("—", None)],
)
def test_parse_percent(mod: types.ModuleType, cell: str, expected: float | None) -> None:
    assert mod.parse_percent(cell) == expected


def test_read_table_drops_geometry_and_section_column(mod: types.ModuleType, tmp_path: Path) -> None:
    path: Path = tmp_path / "t.csv"
    path.write_text(SUMMARY_CSV, encoding="utf-8")
    rows: list[list[str]] = mod.read_table(path)
    assert rows[0] == ["REVENUES", "2025 Estimate", "2026 Budget", "2027 Forecast"]
    assert all(len(row) == 4 for row in rows)


def test_wrapped_labels_are_joined(mod: types.ModuleType) -> None:
    rows: list[list[str]] = [
        ["BEGINNING RESERVE FUND", "", ""],
        ["BALANCE", "5", "6"],
        ["EXPENDITURES", "", ""],
        ["Salaries", "1", "2"],
        ["Fund", "", ""],
        ["ENDING RESERVE FUND BALANCE", "9", "8"],
        ["FUND BALANCE AS A % OF", "", ""],
        ["EXPENDITURES", "1.0%", "2.0%"],
    ]
    joined: list[list[str]] = mod.join_wrapped_rows(rows)
    assert [row[0] for row in joined] == [
        "BEGINNING RESERVE FUND BALANCE", "Salaries", "ENDING RESERVE FUND BALANCE",
        "FUND BALANCE AS A % OF EXPENDITURES",
    ]


# ---------- table extraction ----------

def _source(mod: types.ModuleType, *, year: int, variant: str) -> Any:
    return mod.Source(year=year, variant=variant)


def test_summary_table_records(mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2026, variant="amended"))

    ufb = _find(records, metric=mod.Metric.USE_OF_FUND_BALANCE, fiscal_year=2026)
    assert [r["value"] for r in ufb] == [5000.0]
    assert _find(records, metric=mod.Metric.USE_OF_FUND_BALANCE, fiscal_year=2027)[0]["value"] == 0.0

    rev = _find(records, metric=mod.Metric.REVENUE_BY_CATEGORY, fiscal_year=2026, category="Real Estate Tax")
    assert [(r["value"], r["kind"]) for r in rev] == [(-40.0, "budget")]
    assert _find(records, metric=mod.Metric.TOTAL_REVENUES, fiscal_year=2027)[0]["kind"] == "forecast"
    assert _find(records, metric=mod.Metric.TOTAL_REVENUES, fiscal_year=2025)[0]["kind"] == "estimate"
    assert _find(records, metric=mod.Metric.EXPENDITURE_BY_CATEGORY, fiscal_year=2026, category="Salaries")[0]["value"] == 20.0
    assert _find(records, metric=mod.Metric.OPERATING_RESULT, fiscal_year=2025)[0]["value"] == -5.0
    assert _find(records, metric=mod.Metric.ENDING_RESERVE_BALANCE, fiscal_year=2026)[0]["value"] == -38.0
    pct = _find(records, metric=mod.Metric.FUND_BALANCE_PCT_OF_EXPENDITURES, fiscal_year=2026)
    assert pct[0]["value"] == -4.9
    first = _find(records, metric=mod.Metric.TOTAL_EXPENDITURES, fiscal_year=2025, source_year=2026)
    assert {r["sourceTable"] for r in first} == {"P1T0"}  # department table adds no estimate columns


def test_department_table_contributes_only_actual_totals(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2026, variant="amended"))
    from_department = [r for r in records if r["sourceTable"] == "P2T0" and r["metric"] == mod.Metric.TOTAL_EXPENDITURES]
    assert [(r["fiscalYear"], r["kind"], r["value"]) for r in from_department] == [(2024, "actual", 800.0)]
    assert not [r for r in records if r["category"] == "Finance"]


def test_revenue_history_takes_actuals_only(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2026, variant="amended"))
    history = [r for r in records if r["sourceTable"] == "P2T0" and r["sourceSection"] == REVENUE_FOLDER]
    assert {r["kind"] for r in history} == {"actual"}
    assert {r["fiscalYear"] for r in history} == {2023, 2024}
    assert _find(records, metric=mod.Metric.REVENUE_BY_CATEGORY, fiscal_year=2023, category="Other Taxes")[0]["value"] == -5.0
    assert _find(records, metric=mod.Metric.REVENUE_BY_CATEGORY, fiscal_year=2024, category="Other Taxes")[0]["value"] == 0.0
    assert not [r for r in records if r["category"] == "Annual Growth Rate"]


def test_recurring_revenue_is_derived(mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2026, variant="amended"))
    with_row = _find(records, metric=mod.Metric.RECURRING_REVENUE, fiscal_year=2026)
    assert [(r["value"], r["derived"]) for r in with_row] == [(2000.0 - 5000.0, True)]
    forecast = _find(records, metric=mod.Metric.RECURRING_REVENUE, fiscal_year=2027)
    assert forecast[0]["value"] == 3000.0  # use of fund balance is a nil cell
    actual = _find(records, metric=mod.Metric.RECURRING_REVENUE, fiscal_year=2023)
    assert actual[0]["value"] == 500.0  # no use-of-fund-balance row in the history table


def test_missing_use_of_fund_balance_row_is_no_record(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    csv_without: str = SUMMARY_CSV.replace('Use of Fund Balance,—,"5,000",—,\n', "")
    _write_table(root=tmp_path, year=2025, subtype="operating", folder=FORECAST_FOLDER, name="P1T0", text=csv_without)
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2025, variant="adopted"))
    assert not [r for r in records if r["metric"] == mod.Metric.USE_OF_FUND_BALANCE]
    assert _find(records, metric=mod.Metric.RECURRING_REVENUE, fiscal_year=2026)[0]["value"] == 2000.0


def test_section_folder_matched_by_title_not_number(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2027, subtype="operating-proposed", forecast_folder="02_Five-Year_Financial_Forecast")
    records: list[dict[str, Any]] = mod.extract_source_records(_source(mod, year=2027, variant="proposed"))
    assert records and {r["sourceVariant"] for r in records} == {"proposed"}
    assert "02_Five-Year_Financial_Forecast" in {r["sourceSection"] for r in records}


# ---------- dataset assembly ----------

def test_missing_source_is_skipped_with_note(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    dataset: dict[str, Any] = mod.build_dataset(
        sources=[_source(mod, year=2024, variant="adopted"), _source(mod, year=2026, variant="amended")]
    )
    assert dataset["sources"] == [{"sourceYear": 2026, "sourceVariant": "amended"}]
    assert "2024" in capsys.readouterr().out


def test_actuals_use_latest_source_and_record_restatements(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    newer: str = DEPARTMENT_CSV.replace('"800"', '"900"')
    _fake_source_tree(tmp_path, year=2027, subtype="operating-proposed")
    _write_table(root=tmp_path, year=2027, subtype="operating-proposed", folder=FORECAST_FOLDER, name="P2T0", text=newer)
    dataset: dict[str, Any] = mod.build_dataset(
        sources=[_source(mod, year=2026, variant="amended"), _source(mod, year=2027, variant="proposed")]
    )
    matches = _find(dataset["actuals"], metric=mod.Metric.TOTAL_EXPENDITURES, fiscal_year=2024)
    assert len(matches) == 1
    assert matches[0]["value"] == 900.0 and matches[0]["sourceYear"] == 2027
    assert matches[0]["restatements"] == [{"sourceYear": 2026, "value": 800.0}]
    unchanged = _find(dataset["actuals"], metric=mod.Metric.TOTAL_REVENUES, fiscal_year=2023)[0]
    assert unchanged["restatements"] == []
    assert {r["kind"] for r in dataset["actuals"]} == {"actual"}
    assert dataset["sources"][0] == {"sourceYear": 2027, "sourceVariant": "proposed"}



def _expenditure_actual(mod: types.ModuleType, *, value: float, source_year: int, table: str) -> dict[str, Any]:
    """A total-expenditures actual for 2023 as one document's table reports it."""
    return {
        "metric": mod.Metric.TOTAL_EXPENDITURES, "category": None, "fiscalYear": 2023, "value": value,
        "kind": "actual", "sourceYear": source_year, "sourceVariant": "adopted",
        "sourceSection": "04_Five-Year_Financial_Forecast", "sourceTable": table,
    }


def test_restatements_ignore_rounding_and_list_each_document_once(mod: types.ModuleType) -> None:
    """A few dollars' difference is rounding, and one document's two tables give one restatement."""
    records: list[dict[str, Any]] = [
        _expenditure_actual(mod, value=620_861_745.0, source_year=2026, table="P2T0"),
        _expenditure_actual(mod, value=620_861_736.0, source_year=2025, table="P1T0"),
        _expenditure_actual(mod, value=620_861_736.0, source_year=2025, table="P2T0"),
        _expenditure_actual(mod, value=620_000_000.0, source_year=2024, table="P1T0"),
        _expenditure_actual(mod, value=620_000_000.0, source_year=2024, table="P2T0"),
    ]

    actuals: list[dict[str, Any]] = mod.build_actuals(records)

    assert actuals[0]["restatements"] == [{"sourceYear": 2024, "value": 620_000_000.0}]


# ---------- conflicts between the summary and department tables ----------

def _build_one_source(mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *,
                      department_csv: str = DEPARTMENT_CSV) -> dict[str, Any]:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    _fake_source_tree(tmp_path, year=2026, subtype="operating-amended")
    _write_table(root=tmp_path, year=2026, subtype="operating-amended", folder=FORECAST_FOLDER, name="P2T0",
                 text=department_csv)
    return mod.build_dataset(sources=[_source(mod, year=2026, variant="amended")])


def test_disagreeing_department_total_is_a_conflict(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dataset: dict[str, Any] = _build_one_source(mod, tmp_path, monkeypatch)
    by_year: dict[int, dict[str, Any]] = {c["fiscalYear"]: c for c in dataset["conflicts"]}
    assert set(by_year) == {2025, 2026}
    conflict: dict[str, Any] = by_year[2026]
    assert conflict["metric"] == "totalExpenditures"
    assert conflict["kind"] == "budget"
    assert (conflict["sourceYear"], conflict["sourceVariant"]) == (2026, "amended")
    assert conflict["values"] == [
        {"value": 1800.0, "sourceSection": FORECAST_FOLDER, "sourceTable": "P1T0", "table": "summary"},
        {"value": 950.0, "sourceSection": FORECAST_FOLDER, "sourceTable": "P2T0", "table": "department"},
    ]
    assert by_year[2025]["kind"] == "estimate"


def test_conflicts_leave_the_series_on_the_summary_value(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dataset: dict[str, Any] = _build_one_source(mod, tmp_path, monkeypatch)
    (record,) = _find(dataset["records"], metric="totalExpenditures", fiscal_year=2026)
    assert record["value"] == 1800.0 and record["sourceTable"] == "P1T0"
    assert not [r for r in dataset["records"] if r["metric"] == "totalExpenditures" and r["sourceTable"] == "P2T0"
                and r["kind"] != "actual"]


def test_equal_or_rounding_level_values_are_not_conflicts(
    mod: types.ModuleType, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agreeing: str = DEPARTMENT_CSV.replace('"850","950"', '"901","1,800"')  # 1 dollar apart, and exactly equal
    dataset: dict[str, Any] = _build_one_source(mod, tmp_path, monkeypatch, department_csv=agreeing)
    assert dataset["conflicts"] == []


# ---------- real baselines (hand-checked figures) ----------


@pytest.fixture(scope="module")
def real_dataset() -> dict[str, Any]:
    spec = importlib.util.spec_from_file_location("build_longitudinal_real", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module: types.ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_dataset(sources=module.SOURCES)


def _actual(dataset: dict[str, Any], metric: str, fiscal_year: int) -> dict[str, Any]:
    (record,) = _find(dataset["actuals"], metric=metric, fiscal_year=fiscal_year)
    return record


def test_real_revenue_actuals(real_dataset: dict[str, Any]) -> None:
    expected: dict[int, float] = {
        2020: 551634859.0, 2021: 593604491.0, 2022: 658802293.0, 2023: 697612483.0, 2024: 703636442.0,
    }
    for fiscal_year, value in expected.items():
        assert _actual(real_dataset, "totalRevenues", fiscal_year)["value"] == value


def test_real_total_expenditure_actuals(real_dataset: dict[str, Any]) -> None:
    assert _actual(real_dataset, "totalExpenditures", 2023)["value"] == 620861745.0
    assert _actual(real_dataset, "totalExpenditures", 2024)["value"] == 658305314.0
    latest_2025 = _actual(real_dataset, "totalExpenditures", 2025)
    assert latest_2025["value"] == 667025881.0 and latest_2025["sourceYear"] == 2027
    assert latest_2025["restatements"] == []  # the 2026 document only had a 2025 estimate


def test_real_2027_proposed_figures(real_dataset: dict[str, Any]) -> None:
    records: list[dict[str, Any]] = real_dataset["records"]
    ufb = _find(records, metric="useOfFundBalance", fiscal_year=2027, source_year=2027)
    assert [r["value"] for r in ufb] == [28253606.0]
    recurring = _find(records, metric="recurringRevenue", fiscal_year=2027, source_year=2027)
    assert [r["value"] for r in recurring] == [699073170.0]
    total = _find(records, metric="totalRevenues", fiscal_year=2027, source_year=2027)
    assert total[0]["value"] == pytest.approx(699073170.0 + 28253606.0)
    reserve = _find(records, metric="endingReserveBalance", fiscal_year=2031, source_year=2027)
    assert reserve[0]["value"] == -31404625.0 and reserve[0]["kind"] == "forecast"
    pct = _find(records, metric="fundBalancePctOfExpenditures", fiscal_year=2031, source_year=2027)
    assert pct[0]["value"] == -4.0


def test_real_2027_column_kinds(real_dataset: dict[str, Any]) -> None:
    records: list[dict[str, Any]] = real_dataset["records"]
    kinds: dict[int, set[str]] = {}
    for r in records:
        if r["sourceYear"] == 2027 and r["metric"] == "totalExpenditures":
            kinds.setdefault(r["fiscalYear"], set()).add(r["kind"])
    assert kinds[2026] == {"estimate"}
    assert kinds[2027] == {"budget"}
    assert all(kinds[year] == {"forecast"} for year in range(2028, 2032))
    # the department table's 2026 estimate must not leak in; the summary table is authoritative
    (est_2026,) = _find(records, metric="totalExpenditures", fiscal_year=2026, source_year=2027)
    assert est_2026["value"] == 715078329.0


def test_real_revenue_categories_present(real_dataset: dict[str, Any]) -> None:
    records: list[dict[str, Any]] = real_dataset["records"]
    (eit,) = _find(records, metric="revenueByCategory", fiscal_year=2027, category="Earned Income Tax", source_year=2027)
    assert eit["value"] == 150502766.0
    (eit_2020,) = _find(real_dataset["actuals"], metric="revenueByCategory", fiscal_year=2020, category="Earned Income Tax")
    assert eit_2020["value"] == 109401066.0


def test_real_2027_document_gives_two_2026_expenditure_estimates(real_dataset: dict[str, Any]) -> None:
    (conflict,) = [
        c for c in real_dataset["conflicts"]
        if c["metric"] == "totalExpenditures" and c["fiscalYear"] == 2026 and c["sourceYear"] == 2027
    ]
    assert conflict["kind"] == "estimate" and conflict["sourceVariant"] == "proposed"
    by_table: dict[str, dict[str, Any]] = {v["table"]: v for v in conflict["values"]}
    assert by_table["summary"]["value"] == 715078329.0
    assert by_table["department"]["value"] == 715038329.0
    assert by_table["summary"]["value"] / 1e6 == pytest.approx(715.1, abs=0.05)
    assert by_table["department"]["value"] / 1e6 == pytest.approx(715.0, abs=0.05)
    assert by_table["summary"]["sourceTable"] == "P1T0" and by_table["department"]["sourceTable"] == "P2T0"


def test_real_rounding_level_differences_are_not_conflicts(real_dataset: dict[str, Any]) -> None:
    flagged: set[tuple[int, int]] = {(c["sourceYear"], c["fiscalYear"]) for c in real_dataset["conflicts"]}
    assert (2027, 2028) not in flagged  # 741,529,397 vs 741,529,398
    assert (2027, 2027) not in flagged  # identical
