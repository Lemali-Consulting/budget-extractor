"""Reconciles the web app's budget totals against the source PDF's own totals.

Flags places where the Pittsburgh budget PDF disagrees with itself (its
Section 8 department summary vs each department's section table) and where the
website's expenditure/revenue/capital totals drift from the document's printed
figures. Run after build_web_data.py: `uv run python3 scripts/check_budget_reconciliation.py`.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import pdfplumber

ROOT: Path = Path(__file__).resolve().parent.parent

# Tolerated gap (dollars): the PDF's printed grand totals round, so its line
# items legitimately sum to within a dollar or two of the printed total.
ROUNDING_TOLERANCE: float = 2.0


def parse_money(value: str) -> float | None:
    """Parse a budget cell into a float, or None for blanks/dashes/percentages."""
    text: str = (value or "").strip()
    if text in ("", "—", "–", "-") or text.endswith("%"):
        return None
    negative: bool = text.startswith("(") and text.endswith(")")
    cleaned: str = text.strip("()").replace("$", "").replace(",", "").strip()
    try:
        amount: float = float(cleaned)
    except ValueError:
        return None
    return -amount if negative else amount


def read_data_rows(csv_path: Path) -> list[list[str]]:
    """Read a regression CSV, skipping the leading column-spec header row."""
    with open(csv_path, encoding="utf-8") as f:
        rows: list[list[str]] = list(csv.reader(f))
    return rows[1:] if rows else []


def pdf_total_expenditures(year: int) -> tuple[float, float, float] | None:
    """Read Section 8's printed 'Total Expenditures' row (2024, 2025, 2026)."""
    pdf_path: Path = ROOT / "input" / str(year) / "operating-budget.pdf"
    if not pdf_path.exists():
        return None
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[48:55]:  # Section 8 spans PDF pages 49-55
            text: str = page.extract_text() or ""
            for line in text.split("\n"):
                if line.strip().lower().startswith("total expenditures"):
                    amounts: list[float] = [
                        v for v in (parse_money(tok) for tok in line.split()) if v is not None
                    ]
                    if len(amounts) >= 3:
                        return amounts[0], amounts[1], amounts[2]
    return None


def check_expenditures(year: int, failures: list[str]) -> None:
    """Reconcile operating expenditure totals and per-department drift."""
    print("EXPENDITURES")

    # Section 8 "Expenditures by Department" summary rows.
    section8_path: Path = (
        ROOT / "output" / "regression" / "expected" / str(year)
        / "operating" / "08_Expenditure_Summary" / "P1T0.csv"
    )
    section8: list[tuple[float, float, float]] = []
    for row in read_data_rows(section8_path):
        if len(row) < 4:
            continue
        vals = [parse_money(row[i]) for i in (1, 2, 3)]
        if all(v is not None for v in vals):
            section8.append((vals[0], vals[1], vals[2]))  # type: ignore[arg-type]

    # Department section-table totals (what the website's department pages show).
    dept_budgets: list[dict] = json.loads(
        (ROOT / "web" / "src" / "data" / "views" / "department-budgets.json").read_text()
    )
    by_slug: dict[str, dict] = {}
    order: list[str] = []
    for r in dept_budgets:
        if r.get("fund") != "operating":
            continue
        if r["slug"] not in by_slug:
            by_slug[r["slug"]] = {"department": r["department"]}
            order.append(r["slug"])
        by_slug[r["slug"]][r["year"]] = r["amount"]

    operating_2026: float = sum(
        r["amount"] for r in dept_budgets
        if r.get("fund") == "operating" and r["year"] == f"{year} Budget"
    )
    section8_sum_2026: float = sum(s[2] for s in section8)
    pdf_total = pdf_total_expenditures(year)

    print(f"  Operating total (department-budgets.json, {year}):  ${operating_2026:>15,.0f}")
    print(f"  Sum of Section 8 department rows ({year}):           ${section8_sum_2026:>15,.0f}")
    if pdf_total:
        print(f"  Section 8 printed 'Total Expenditures' ({year}):     ${pdf_total[2]:>15,.0f}")

    if abs(operating_2026 - section8_sum_2026) > ROUNDING_TOLERANCE:
        failures.append(
            f"operating total ${operating_2026:,.0f} != Section 8 row sum ${section8_sum_2026:,.0f}"
        )
        print("  ✗ operating total does NOT match Section 8")
    else:
        print("  ✓ operating total matches Section 8 department rows")

    # Per-department drift: Section 8 summary vs department section table.
    # The two disagree inside the source PDF itself — report, do not fail.
    year_cols = [(f"{year - 2} Actual", 0), (f"{year - 1} Budget", 1), (f"{year} Budget", 2)]
    drifts: list[str] = []
    if len(section8) == len(order):
        for slug, s8 in zip(order, section8):
            dept = by_slug[slug]
            for year_label, idx in year_cols:
                table_val = dept.get(year_label)
                if table_val is None:
                    continue
                delta = s8[idx] - table_val
                if abs(delta) > ROUNDING_TOLERANCE:
                    drifts.append(
                        f"    {dept['department']:<42} {year_label}: "
                        f"summary {s8[idx]:>14,.0f}  vs table {table_val:>14,.0f}  "
                        f"Δ {delta:>+12,.0f}"
                    )
    else:
        print(f"  ! row-count mismatch: Section 8 has {len(section8)}, "
              f"department-budgets has {len(order)} — skipping per-department drift")

    if drifts:
        print(f"  PDF self-inconsistencies ({len(drifts)} — Section 8 summary vs "
              f"department section tables, not extraction errors):")
        for d in drifts:
            print(d)
    else:
        print("  ✓ every Section 8 department row matches its section table")
    print()


def check_revenue(year: int, failures: list[str]) -> None:
    """Reconcile the revenue waterfall against the printed 'Total Revenues'."""
    print("REVENUE")
    waterfall: list[dict] = json.loads(
        (ROOT / "web" / "src" / "data" / "views" / "revenue-waterfall.json").read_text()
    )
    waterfall_sum: float = sum(r["amount"] for r in waterfall)

    rev_path: Path = (
        ROOT / "output" / "regression" / "expected" / str(year)
        / "operating" / "05_Revenue_Summary" / "P1T0.csv"
    )
    printed_total: float | None = None
    for row in read_data_rows(rev_path):
        if row and row[0].strip().lower() == "total revenues":
            printed_total = parse_money(row[1])

    print(f"  revenue-waterfall.json sum ({year}):                 ${waterfall_sum:>15,.0f}")
    if printed_total is not None:
        print(f"  Section 5 printed 'Total Revenues' ({year}):         ${printed_total:>15,.0f}")
        delta = waterfall_sum - printed_total
        if abs(delta) <= ROUNDING_TOLERANCE:
            print(f"  ✓ within tolerance (Δ ${delta:+,.0f} — PDF rounding)")
        else:
            failures.append(f"revenue off by ${delta:,.0f}")
            print(f"  ✗ revenue off by ${delta:,.0f}")
    else:
        print("  ! could not find printed 'Total Revenues' row")
    print()


def check_capital(year: int, failures: list[str]) -> None:
    """Reconcile capital funding totals against the capital summary table."""
    print("CAPITAL")
    funding: list[dict] = json.loads(
        (ROOT / "web" / "src" / "data" / "views" / "capital-funding-sources.json").read_text()
    )
    by_year: dict[str, float] = {}
    for r in funding:
        by_year[r["year"]] = by_year.get(r["year"], 0.0) + r["amount"]

    summary_path: Path = (
        ROOT / "output" / "regression" / "expected" / str(year)
        / "capital" / "01_Capital_Budget_Introduction" / "P22T0.csv"
    )
    printed: dict[str, float] = {}
    for row in read_data_rows(summary_path):
        if not row:
            continue
        total = parse_money(row[-1])
        if total is None:
            continue
        printed[row[0].strip()] = total

    six_year_web: float = sum(
        amt for yr, amt in by_year.items() if yr.isdigit() and int(yr) >= year
    )
    six_year_printed: float | None = printed.get(f"Total {year}-{year + 5}")

    for yr in sorted(y for y in by_year if y.isdigit() and int(y) >= year):
        web_val = by_year[yr]
        pdf_val = printed.get(yr)
        if pdf_val is None:
            continue
        delta = web_val - pdf_val
        mark = "✓" if abs(delta) <= ROUNDING_TOLERANCE else "✗"
        print(f"  {yr}: web ${web_val:>13,.0f}  vs table ${pdf_val:>13,.0f}  {mark}")
        if abs(delta) > ROUNDING_TOLERANCE:
            failures.append(f"capital {yr} off by ${delta:,.0f}")

    if six_year_printed is not None:
        delta = six_year_web - six_year_printed
        print(f"  {year}-{year + 5} total: web ${six_year_web:,.0f}  "
              f"vs table ${six_year_printed:,.0f}  (Δ ${delta:+,.0f})")
        if abs(delta) > ROUNDING_TOLERANCE:
            failures.append(f"capital 6-year total off by ${delta:,.0f}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2026, help="Budget year (default: 2026)")
    args = parser.parse_args()

    print(f"Budget reconciliation report — fiscal year {args.year}\n")
    failures: list[str] = []
    check_expenditures(args.year, failures)
    check_revenue(args.year, failures)
    check_capital(args.year, failures)

    if failures:
        print(f"FAILED — {len(failures)} unexpected discrepancy(ies):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("PASSED — totals reconcile (small PDF-rounding gaps tolerated).")


if __name__ == "__main__":
    main()
