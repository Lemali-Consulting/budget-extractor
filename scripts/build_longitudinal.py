"""Build a long-run dataset of Pittsburgh's headline budget figures from the operating-budget baselines.

Reads the Five-Year Financial Forecast and Revenue Summary tables of every budget document and writes
web/src/data/views/longitudinal.json, labelling each figure actual, estimate, budget or forecast. Where one
document's summary table and department table give different totals for the same year, both are recorded as conflicts.
"""

import csv
import json
import re
import sys
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import NotRequired, TypedDict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils import paths


class Metric(StrEnum):
    """Headline figures tracked across budget documents."""

    TOTAL_REVENUES = "totalRevenues"
    USE_OF_FUND_BALANCE = "useOfFundBalance"
    RECURRING_REVENUE = "recurringRevenue"
    TOTAL_EXPENDITURES = "totalExpenditures"
    OPERATING_RESULT = "operatingResult"
    ENDING_RESERVE_BALANCE = "endingReserveBalance"
    FUND_BALANCE_PCT_OF_EXPENDITURES = "fundBalancePctOfExpenditures"
    REVENUE_BY_CATEGORY = "revenueByCategory"
    EXPENDITURE_BY_CATEGORY = "expenditureByCategory"


class Kind(StrEnum):
    """How firmly a figure is known."""

    ACTUAL = "actual"
    ESTIMATE = "estimate"
    BUDGET = "budget"
    FORECAST = "forecast"


class TableKind(StrEnum):
    """The three headline table layouts this script understands."""

    SUMMARY = "summary"
    DEPARTMENT = "department"
    REVENUE_HISTORY = "revenueHistory"


class ConflictValue(TypedDict):
    """One table's figure in a conflict."""

    value: float
    sourceSection: str
    sourceTable: str
    table: str


class Conflict(TypedDict):
    """Two tables of one document disagreeing about the same figure."""

    metric: str
    fiscalYear: int
    kind: str
    sourceYear: int
    sourceVariant: str
    values: list[ConflictValue]


class Record(TypedDict):
    """One figure for one fiscal year as reported by one budget document."""

    metric: str
    category: str | None
    fiscalYear: int
    value: float
    kind: str
    sourceYear: int
    sourceVariant: str
    sourceSection: str
    sourceTable: str
    derived: NotRequired[bool]
    restatements: NotRequired[list[dict[str, float | int]]]


@dataclass(frozen=True)
class Source:
    """One budget document whose baselines feed the dataset."""

    year: int
    variant: str


@dataclass(frozen=True)
class YearColumn:
    """A table column that holds one fiscal year's figures."""

    index: int
    fiscal_year: int
    kind: Kind


@dataclass(frozen=True)
class SourceRecords:
    """What one budget document yields: the series records, plus the department table's non-actual totals."""

    records: list[Record]
    alternates: list[Record]


@dataclass(frozen=True)
class TableRule:
    """Which rows and columns a table layout contributes."""

    actual_columns_only: bool
    metrics: frozenset[Metric]


VARIANT_ADOPTED: str = "adopted"
VARIANT_AMENDED: str = "amended"
VARIANT_PROPOSED: str = "proposed"
BUDGET_TYPE: str = "operating"

SOURCES: list[Source] = [
    Source(year=2024, variant=VARIANT_ADOPTED),
    Source(year=2025, variant=VARIANT_ADOPTED),
    Source(year=2026, variant=VARIANT_AMENDED),
    Source(year=2027, variant=VARIANT_PROPOSED),
]

FORECAST_SECTION_TITLE: str = "Five-Year_Financial_Forecast"
REVENUE_SECTION_TITLE: str = "Revenue_Summary"
SECTION_FOLDER_PATTERN: re.Pattern[str] = re.compile(r"^\d+_(?P<title>.+)$")
TABLE_FILE_PATTERN: re.Pattern[str] = re.compile(r"^P(?P<page>\d+)T(?P<table>\d+)\.csv$")
OUTPUT_FILE_NAME: str = "longitudinal.json"
OUTPUT_SUBDIR: str = "views"

SECTION_COLUMN_HEADER: str = "section"
SUMMARY_HEADER_LABEL: str = "REVENUES"
NIL_CELL: str = "—"
YEAR_COLUMN_PATTERN: re.Pattern[str] = re.compile(
    r"^(?P<year>\d{4})\s+(?P<label>Actual|Estimate|Budget|Amended|Forecast)$", re.IGNORECASE
)
LABEL_KINDS: dict[str, Kind] = {
    "actual": Kind.ACTUAL,
    "estimate": Kind.ESTIMATE,
    "budget": Kind.BUDGET,
    "amended": Kind.BUDGET,
    "forecast": Kind.FORECAST,
}

LABEL_USE_OF_FUND_BALANCE: str = "Use of Fund Balance"
LABEL_TOTAL_REVENUES: str = "Total Revenues"
LABEL_TOTAL_EXPENDITURES: str = "Total Expenditures"
LABEL_OPERATING_RESULT: str = "OPERATING RESULT"
LABEL_ENDING_RESERVE: str = "ENDING RESERVE FUND BALANCE"
LABEL_FUND_BALANCE_PCT: str = "FUND BALANCE AS A % OF EXPENDITURES"

FIXED_ROW_METRICS: dict[str, Metric] = {
    LABEL_USE_OF_FUND_BALANCE: Metric.USE_OF_FUND_BALANCE,
    LABEL_TOTAL_REVENUES: Metric.TOTAL_REVENUES,
    LABEL_TOTAL_EXPENDITURES: Metric.TOTAL_EXPENDITURES,
    LABEL_OPERATING_RESULT: Metric.OPERATING_RESULT,
    LABEL_ENDING_RESERVE: Metric.ENDING_RESERVE_BALANCE,
    LABEL_FUND_BALANCE_PCT: Metric.FUND_BALANCE_PCT_OF_EXPENDITURES,
}
REVENUE_CATEGORIES: tuple[str, ...] = (
    "Real Estate Tax", "Earned Income Tax", "Payroll Preparation Tax", "Parking Tax",
    "Regional Asset District Tax Relief", "Deed Transfer Tax", "Amusement Tax", "Local Service Tax",
    "Facility Usage Fee", "Telecommunications Licensing Tax", "Institution Service Privilege Tax",
    "Non-Profit Payment for Services", "Other Taxes", "Licenses and Permits", "Charges for Services",
    "Fines and Forfeitures", "Intergovernmental Revenue", "Interest Earnings", "Miscellaneous Revenues",
)
EXPENDITURE_CATEGORIES: tuple[str, ...] = (
    "Salaries", "Health Benefits", "Workers' Comp.", "Pension & OPEB", "Operating Departments", "Debt Service",
)
KNOWN_LABELS: frozenset[str] = frozenset(
    (*FIXED_ROW_METRICS, *REVENUE_CATEGORIES, *EXPENDITURE_CATEGORIES)
)

TABLE_RULES: dict[TableKind, TableRule] = {
    TableKind.SUMMARY: TableRule(actual_columns_only=False, metrics=frozenset(Metric) - {Metric.RECURRING_REVENUE}),
    TableKind.DEPARTMENT: TableRule(actual_columns_only=True, metrics=frozenset({Metric.TOTAL_EXPENDITURES})),
    TableKind.REVENUE_HISTORY: TableRule(
        actual_columns_only=True, metrics=frozenset({Metric.TOTAL_REVENUES, Metric.REVENUE_BY_CATEGORY})
    ),
}
# Differences up to this many dollars are rounding in the document, not disagreement.
CONFLICT_ROUNDING_TOLERANCE_DOLLARS: float = 1.0
CONFLICT_METRICS: frozenset[Metric] = frozenset({Metric.TOTAL_EXPENDITURES})
# A restated actual within this fraction of the newer figure is rounding (e.g. $9 on $620M), not a restatement.
RESTATEMENT_RELATIVE_TOLERANCE: float = 1e-6
PERCENT_METRICS: frozenset[Metric] = frozenset({Metric.FUND_BALANCE_PCT_OF_EXPENDITURES})
SECTION_TABLE_KINDS: dict[str, tuple[TableKind, ...]] = {
    FORECAST_SECTION_TITLE: (TableKind.SUMMARY, TableKind.DEPARTMENT),
    REVENUE_SECTION_TITLE: (TableKind.REVENUE_HISTORY,),
}


def parse_year_column(header: str, document_year: int) -> YearColumn | None:
    """Parse a "{YYYY} {Label}" header into a fiscal year and kind; any year after the document's own is a forecast."""
    match: re.Match[str] | None = YEAR_COLUMN_PATTERN.match(header.strip())
    if match is None:
        return None
    fiscal_year: int = int(match.group("year"))
    kind: Kind = Kind.FORECAST if fiscal_year > document_year else LABEL_KINDS[match.group("label").lower()]
    return YearColumn(index=-1, fiscal_year=fiscal_year, kind=kind)


def parse_amount(cell: str) -> float | None:
    """Parse "1,234", "(1,234)" or the nil dash; returns None for blanks and non-numbers."""
    text: str = cell.strip()
    if text == NIL_CELL:
        return 0.0
    match: re.Match[str] | None = re.fullmatch(r"(\()?(\d[\d,]*(?:\.\d+)?)\)?", text)
    if match is None:
        return None
    number: float = float(match.group(2).replace(",", ""))
    return -number if match.group(1) else number


def parse_percent(cell: str) -> float | None:
    """Parse "28.0%", "17.7 %" or "(0.5)%" into a percent number; None when the cell is not a percent."""
    match: re.Match[str] | None = re.fullmatch(r"(\()?(\d+(?:\.\d+)?)\)?\s*%", cell.strip())
    if match is None:
        return None
    number: float = float(match.group(2))
    return -number if match.group(1) else number


def read_table(path: Path) -> list[list[str]]:
    """Read a baseline CSV: drop the geometry line and any trailing carried-forward `section` column."""
    with path.open(newline="", encoding="utf-8") as handle:
        rows: list[list[str]] = list(csv.reader(handle))[1:]
    if rows and rows[0] and rows[0][-1] == SECTION_COLUMN_HEADER:
        rows = [row[:-1] for row in rows]
    return rows


def _normalize_label(label: str) -> str:
    return " ".join(label.split())


def _has_values(row: list[str]) -> bool:
    return any(cell.strip() for cell in row[1:])


def join_wrapped_rows(rows: list[list[str]]) -> list[list[str]]:
    """Merge a value-less label row with the continuation row below it; stray headings are dropped."""
    joined: list[list[str]] = []
    pending: str | None = None
    for row in rows:
        label: str = _normalize_label(row[0]) if row else ""
        if not _has_values(row):
            pending = label or None
            continue
        if pending is not None and label not in KNOWN_LABELS:
            label = f"{pending} {label}"
        pending = None
        joined.append([label, *row[1:]])
    return joined


def year_columns(header: list[str], document_year: int) -> list[YearColumn]:
    """All year-bearing columns of a header row, with their column indices."""
    columns: list[YearColumn] = []
    for index, cell in enumerate(header):
        parsed: YearColumn | None = parse_year_column(cell, document_year)
        if parsed is not None:
            columns.append(YearColumn(index=index, fiscal_year=parsed.fiscal_year, kind=parsed.kind))
    return columns


def classify_table(rows: list[list[str]], document_year: int) -> TableKind | None:
    """Recognise a headline table by its header row and total-row labels."""
    if not rows:
        return None
    header: list[str] = rows[0]
    if _normalize_label(header[0]) == SUMMARY_HEADER_LABEL:
        return TableKind.SUMMARY
    columns: list[YearColumn] = year_columns(header, document_year)
    if header[0].strip() or not columns:
        return None
    labels: set[str] = {_normalize_label(row[0]) for row in rows[1:] if row}
    if LABEL_TOTAL_EXPENDITURES in labels:
        return TableKind.DEPARTMENT
    has_actual: bool = any(column.kind is Kind.ACTUAL for column in columns)
    if LABEL_TOTAL_REVENUES in labels and has_actual:
        return TableKind.REVENUE_HISTORY
    return None


def metric_for_label(label: str) -> tuple[Metric, str | None] | None:
    """Map a row label to its metric and category (category only for per-line metrics)."""
    if label in FIXED_ROW_METRICS:
        return FIXED_ROW_METRICS[label], None
    if label in REVENUE_CATEGORIES:
        return Metric.REVENUE_BY_CATEGORY, label
    if label in EXPENDITURE_CATEGORIES:
        return Metric.EXPENDITURE_BY_CATEGORY, label
    return None


def rule_columns(*, rows: list[list[str]], table_kind: TableKind, source: Source) -> list[YearColumn]:
    """The year columns a table layout contributes to the series (actual-only layouts skip the rest)."""
    rule: TableRule = TABLE_RULES[table_kind]
    return [
        column for column in year_columns(rows[0], source.year)
        if column.kind is Kind.ACTUAL or not rule.actual_columns_only
    ]


def non_actual_columns(*, rows: list[list[str]], source: Source) -> list[YearColumn]:
    """The estimate, budget and forecast columns of a table."""
    return [column for column in year_columns(rows[0], source.year) if column.kind is not Kind.ACTUAL]


def extract_table_records(
    *, rows: list[list[str]], table_kind: TableKind, columns: list[YearColumn], source: Source, section: str, table: str,
    metrics: frozenset[Metric],
) -> list[Record]:
    """Turn the given columns of one headline table into records for the given metrics."""
    records: list[Record] = []
    for row in join_wrapped_rows(rows[1:]):
        target: tuple[Metric, str | None] | None = metric_for_label(row[0])
        if target is None or target[0] not in metrics:
            continue
        metric, category = target
        parse = parse_percent if metric in PERCENT_METRICS else parse_amount
        for column in columns:
            value: float | None = parse(row[column.index]) if column.index < len(row) else None
            if value is None:
                continue
            records.append(Record(
                metric=metric, category=category, fiscalYear=column.fiscal_year, value=value, kind=column.kind,
                sourceYear=source.year, sourceVariant=source.variant, sourceSection=section, sourceTable=table,
            ))
    return records


def _table_sort_key(path: Path) -> tuple[int, int]:
    match: re.Match[str] | None = TABLE_FILE_PATTERN.match(path.name)
    assert match is not None
    return int(match.group("page")), int(match.group("table"))


def find_section_dirs(*, source_dir: Path, title: str) -> list[Path]:
    """Section folders whose name, minus its numeric prefix, equals the given title."""
    found: list[Path] = []
    for child in sorted(source_dir.iterdir()):
        match: re.Match[str] | None = SECTION_FOLDER_PATTERN.match(child.name)
        if child.is_dir() and match is not None and match.group("title") == title:
            found.append(child)
    return found


def _section_records(*, section_dir: Path, wanted: tuple[TableKind, ...], source: Source) -> SourceRecords:
    records: list[Record] = []
    alternates: list[Record] = []
    remaining: set[TableKind] = set(wanted)
    table_paths: list[Path] = sorted(
        (p for p in section_dir.glob("P*T*.csv") if TABLE_FILE_PATTERN.match(p.name)), key=_table_sort_key
    )
    for table_path in table_paths:
        rows: list[list[str]] = read_table(table_path)
        table_kind: TableKind | None = classify_table(rows, source.year)
        if table_kind not in remaining:
            continue
        remaining.discard(table_kind)
        common = {"rows": rows, "table_kind": table_kind, "source": source, "section": section_dir.name,
                  "table": table_path.stem}
        records.extend(extract_table_records(
            **common, columns=rule_columns(rows=rows, table_kind=table_kind, source=source),
            metrics=TABLE_RULES[table_kind].metrics,
        ))
        if table_kind is TableKind.DEPARTMENT:
            alternates.extend(extract_table_records(
                **common, columns=non_actual_columns(rows=rows, source=source), metrics=CONFLICT_METRICS,
            ))
    for missing in sorted(remaining):
        print(f"  note: {source.year} {source.variant}: no {missing} table in {section_dir.name}")
    return SourceRecords(records=records, alternates=alternates)


def derive_recurring_revenue(records: list[Record]) -> list[Record]:
    """Recurring revenue = total revenues minus use of fund balance (when that row exists in the same table)."""
    key = lambda r: (r["sourceYear"], r["sourceVariant"], r["fiscalYear"], r["sourceTable"])  # noqa: E731
    fund_balance: dict[tuple[int, str, int, str], float] = {
        key(r): r["value"] for r in records if r["metric"] == Metric.USE_OF_FUND_BALANCE
    }
    derived: list[Record] = []
    for record in records:
        if record["metric"] != Metric.TOTAL_REVENUES:
            continue
        derived.append(Record(
            **{**record, "metric": Metric.RECURRING_REVENUE, "value": record["value"] - fund_balance.get(key(record), 0.0),
               "derived": True}
        ))
    return derived


def extract_source(source: Source) -> SourceRecords:
    """All headline records of one budget document (with derived recurring revenue) and its alternate totals."""
    source_dir: Path = paths.expected_dir(source.year, paths.variant_type(BUDGET_TYPE, source.variant))
    records: list[Record] = []
    alternates: list[Record] = []
    for title, wanted in SECTION_TABLE_KINDS.items():
        for section_dir in find_section_dirs(source_dir=source_dir, title=title):
            found: SourceRecords = _section_records(section_dir=section_dir, wanted=wanted, source=source)
            records.extend(found.records)
            alternates.extend(found.alternates)
    return SourceRecords(records=records + derive_recurring_revenue(records), alternates=alternates)


def extract_source_records(source: Source) -> list[Record]:
    """All headline records of one budget document, including derived recurring revenue."""
    return extract_source(source).records


def _conflict_value(*, record: Record, table: TableKind) -> ConflictValue:
    return ConflictValue(
        value=record["value"], sourceSection=record["sourceSection"], sourceTable=record["sourceTable"], table=table,
    )


def build_conflicts(*, records: list[Record], alternates: list[Record]) -> list[Conflict]:
    """Alternate (department-table) totals that differ from the summary table's value for the same document and year.

    The summary table's record stays the series value; the pair is reported here so readers can see both.
    """
    summary: dict[tuple[str, int, str, int], Record] = {
        (r["metric"], r["sourceYear"], r["sourceVariant"], r["fiscalYear"]): r
        for r in records
        if r["category"] is None and r["metric"] in CONFLICT_METRICS
    }
    conflicts: list[Conflict] = []
    for alternate in alternates:
        base: Record | None = summary.get(
            (alternate["metric"], alternate["sourceYear"], alternate["sourceVariant"], alternate["fiscalYear"])
        )
        if base is None or abs(base["value"] - alternate["value"]) <= CONFLICT_ROUNDING_TOLERANCE_DOLLARS:
            continue
        conflicts.append(Conflict(
            metric=alternate["metric"], fiscalYear=alternate["fiscalYear"], kind=base["kind"],
            sourceYear=alternate["sourceYear"], sourceVariant=alternate["sourceVariant"],
            values=[
                _conflict_value(record=base, table=TableKind.SUMMARY),
                _conflict_value(record=alternate, table=TableKind.DEPARTMENT),
            ],
        ))
    return conflicts


def _is_restatement(*, older: float, newer: float) -> bool:
    """True when an older document's actual differs from the newer one by more than rounding."""
    return abs(older - newer) > abs(newer) * RESTATEMENT_RELATIVE_TOLERANCE


def build_actuals(records: list[Record]) -> list[Record]:
    """One actual per (metric, category, fiscal year) from the newest document, listing differing older values."""
    by_key: dict[tuple[str, str, int], list[Record]] = {}
    for record in records:
        if record["kind"] == Kind.ACTUAL:
            by_key.setdefault((record["metric"], record["category"] or "", record["fiscalYear"]), []).append(record)
    actuals: list[Record] = []
    for key in sorted(by_key):
        candidates: list[Record] = by_key[key]
        latest: Record = max(candidates, key=lambda r: r["sourceYear"])
        restated: set[tuple[int, float]] = {
            (r["sourceYear"], r["value"])
            for r in candidates
            if r["sourceYear"] != latest["sourceYear"] and _is_restatement(older=r["value"], newer=latest["value"])
        }
        restatements: list[dict[str, float | int]] = [
            {"sourceYear": year, "value": value} for year, value in sorted(restated)
        ]
        actuals.append(Record(**{**latest, "restatements": restatements}))
    return actuals


def build_dataset(*, sources: list[Source]) -> dict[str, object]:
    """Assemble sources, every record, the reconciled actuals and table conflicts; sources without baselines are skipped."""
    present: list[Source] = []
    records: list[Record] = []
    alternates: list[Record] = []
    for source in sources:
        source_dir: Path = paths.expected_dir(source.year, paths.variant_type(BUDGET_TYPE, source.variant))
        if not source_dir.is_dir():
            print(f"  skipping {source.year} {source.variant}: no baselines at {source_dir}")
            continue
        present.append(source)
        extracted: SourceRecords = extract_source(source)
        records.extend(extracted.records)
        alternates.extend(extracted.alternates)
    ordered: list[Source] = sorted(present, key=lambda s: s.year, reverse=True)
    return {
        "sources": [{"sourceYear": s.year, "sourceVariant": s.variant} for s in ordered],
        "records": records,
        "actuals": build_actuals(records),
        "conflicts": build_conflicts(records=records, alternates=alternates),
    }


def output_path() -> Path:
    """Where the dataset is written."""
    return paths.web_data_dir() / OUTPUT_SUBDIR / OUTPUT_FILE_NAME


def main() -> None:
    """Build the dataset and write it to the web data directory."""
    dataset: dict[str, object] = build_dataset(sources=SOURCES)
    target: Path = output_path()
    target.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    sources: list[object] = dataset["sources"]  # type: ignore[assignment]
    print(f"wrote {target} ({len(dataset['records'])} records from {len(sources)} sources)")  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
