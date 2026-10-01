"""Post-extraction data validation.

Three passes:
  structural  — checks raw CSVs for extraction anomalies
  cross-year  — compares overlapping columns between budget years
  outliers    — flags statistical anomalies in built JSON data

Run after extraction and before baselining to catch issues early.
"""

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import (
    DEFAULT_YEAR,
    PROJECT_ROOT,
    available_years,
    best_sections_path,
    debug_dir,
    expected_dir,
    input_dir,
    variant_type,
    web_data_dir,
)

def bundle_prefix(*, year: int, override: str | None) -> str:
    """Filename prefix of a year's built JSON bundle.

    An explicit override (e.g. "scratch2027") is used as given; with no override,
    the default year is unprefixed and every other year is "{year}-".
    """
    if override is not None:
        return f"{override}-" if override else ""
    return "" if year == DEFAULT_YEAR else f"{year}-"


# ── Known issues ────────────────────────────────────────────────────────

KNOWN_ISSUES_PATH = PROJECT_ROOT / "output" / "known_issues.json"


def load_known_issues() -> set[str]:
    """Load known issue keys to suppress from the report."""
    if KNOWN_ISSUES_PATH.exists():
        with open(KNOWN_ISSUES_PATH) as f:
            data = json.load(f)
        return set(data.get("suppress", []))
    return set()


def save_known_issues(issues: set[str]) -> None:
    """Save known issue keys."""
    with open(KNOWN_ISSUES_PATH, "w") as f:
        json.dump({"suppress": sorted(issues)}, f, indent=2)


# ── Report types ────────────────────────────────────────────────────────

@dataclass
class Finding:
    severity: str  # ERROR, WARN, INFO
    category: str  # STRUCTURAL, CROSS-YEAR, OUTLIER, MISSING
    location: str  # e.g., "27_Bureau_of_Fire/P5T0" or "Bureau of Fire"
    message: str
    key: str = ""  # unique key for known-issues suppression

    def __post_init__(self) -> None:
        if not self.key:
            self.key = f"{self.category}:{self.location}:{self.message[:50]}"

    def __str__(self) -> str:
        return f"{self.severity:<7} {self.category:<12} {self.location:<50} {self.message}"


# ── Pass 1: Structural ─────────────────────────────────────────────────

MERGE_PATTERNS = [
    re.compile(r"[\d,]+\.?\d*\s{2,}[\d,]+\.?\d*"),
    re.compile(r"\([\d,]+\)\s+\(?[\d.]+\)?%"),
    re.compile(r"[\d,]+\.?\d*\s{2,}\d+\.?\d*%"),
]


def validate_csv_structural(csv_path: Path, pdf_stem: str, year: int) -> list[Finding]:
    """Run structural checks on a single extracted CSV."""
    findings: list[Finding] = []
    loc = f"{pdf_stem}/{csv_path.stem}"

    with open(csv_path) as f:
        rows = list(csv.reader(f))

    if not rows:
        findings.append(Finding("ERROR", "STRUCTURAL", loc, "empty CSV"))
        return findings

    coord_row = rows[0]
    # Strip section column from coord row
    if coord_row and coord_row[-1] == "section":
        coord_row = coord_row[:-1]

    num_data_cols = len(coord_row)
    headers = rows[1] if len(rows) > 1 else []
    # Strip section column from headers
    if headers and headers[-1] == "section":
        headers = headers[:-1]

    data_rows = rows[2:] if len(rows) > 2 else []

    # Check 1: Header/data column mismatch
    if len(headers) > num_data_cols:
        extra = len(headers) - num_data_cols
        findings.append(Finding(
            "ERROR", "STRUCTURAL", loc,
            f"header has {len(headers)} cols, data has {num_data_cols} ({extra} extra)",
        ))

    # Check 2: Single-column table
    if num_data_cols == 1:
        findings.append(Finding("WARN", "STRUCTURAL", loc, "single-column table (likely prose)"))
        return findings

    # Check 3: No data rows
    if len(data_rows) == 0:
        findings.append(Finding("WARN", "STRUCTURAL", loc, "no data rows (header only)"))

    # Check 4: Merged cells (multiple numbers in one cell)
    merge_count = 0
    merge_examples: list[str] = []
    for r_idx, row in enumerate(data_rows):
        for c_idx, cell in enumerate(row):
            if any(p.search(cell) for p in MERGE_PATTERNS):
                merge_count += 1
                if len(merge_examples) < 3:
                    merge_examples.append(f"R{r_idx + 2}C{c_idx}: '{cell}'")
    if merge_count > 0:
        findings.append(Finding(
            "WARN", "STRUCTURAL", loc,
            f"possible merged cells ({merge_count}): {merge_examples}",
        ))

    # Check 5: Page number leak
    if data_rows:
        last_row = data_rows[-1]
        non_empty = [c for c in last_row if c.strip()]
        if len(non_empty) == 1 and re.fullmatch(r"\d{1,3}", non_empty[0].strip()):
            findings.append(Finding("WARN", "STRUCTURAL", loc, f"last row looks like page number: '{non_empty[0].strip()}'"))

    # Check 6: Sparse table (most rows have <=1 non-empty cell)
    if num_data_cols >= 3 and len(data_rows) >= 3:
        sparse = sum(1 for row in data_rows if sum(1 for c in row if c.strip()) <= 1)
        if sparse / len(data_rows) > 0.7:
            findings.append(Finding("WARN", "STRUCTURAL", loc, f"{sparse}/{len(data_rows)} rows sparse"))

    # Check 7: Prose captured as table
    if num_data_cols >= 2 and len(data_rows) >= 3:
        prose = sum(1 for row in data_rows[:10] if row and len(row[0]) > 100 and all(c.strip() == "" for c in row[1:]))
        if prose >= 2:
            findings.append(Finding("WARN", "STRUCTURAL", loc, f"first rows look like prose ({prose} text-only rows)"))

    # Check 8: Dollar sign leftover
    for row in data_rows:
        for cell in row:
            if "$" in cell:
                findings.append(Finding("WARN", "STRUCTURAL", loc, "dollar sign in data cell"))
                break
        else:
            continue
        break

    # Check 9: Year header sanity — financial tables with year+Budget/Actual columns
    # should reference the document year. Only trigger if headers contain a pattern
    # like "2024 Actual" or "2025 Budget" (year followed by Budget/Actual).
    year_budget_re = re.compile(r"\b(20\d{2})\s+(Budget|Actual)", re.IGNORECASE)
    year_budget_matches = year_budget_re.findall(" ".join(headers))
    if year_budget_matches:
        found_years = {int(m[0]) for m in year_budget_matches}
        expected_years = {year, year - 1, year - 2}
        if not found_years & expected_years:
            findings.append(Finding(
                "ERROR", "STRUCTURAL", loc,
                f"year headers {sorted(found_years)} don't match document year {year}",
            ))

    # Check 10: Total row quality — financial tables should have a parseable total
    header_text = " ".join(headers).lower()
    has_budget = bool(year_budget_matches)
    if has_budget and "fte" not in header_text:
        has_good_total = False
        for row in data_rows:
            label = (row[0] if row else "").lower()
            if "total" in label and "subtotal" not in label:
                # Check if any cell has a parseable number
                for cell in row[1:]:
                    cleaned = cell.replace(",", "").replace("$", "").replace("(", "-").replace(")", "").strip()
                    if cleaned and cleaned != "—" and cleaned != "—%":
                        try:
                            float(cleaned)
                            has_good_total = True
                            break
                        except ValueError:
                            pass
                if has_good_total:
                    break
        if not has_good_total and len(data_rows) >= 3:
            findings.append(Finding("WARN", "STRUCTURAL", loc, "financial table with no parseable total row"))

    return findings


def run_structural(
    year: int,
    source: str = "debug",
    *,
    operating_variant: str = "adopted",
    capital_variant: str = "adopted",
) -> list[Finding]:
    """Run structural validation on all CSVs for a year."""
    findings: list[Finding] = []

    if source == "debug":
        base = debug_dir(year)
        if not base.exists():
            print(f"No debug directory for {year}. Run extractor first.")
            return findings
        for stem_dir in sorted(base.iterdir()):
            if not stem_dir.is_dir():
                continue
            for csv_path in sorted(stem_dir.glob("P*T*.csv")):
                findings.extend(validate_csv_structural(csv_path, stem_dir.name, year))
    else:
        subtypes: tuple[str, str] = (
            variant_type("operating", operating_variant),
            variant_type("capital", capital_variant),
        )
        for subtype in subtypes:
            base = expected_dir(year, subtype)
            if not base.exists():
                continue
            for stem_dir in sorted(base.iterdir()):
                if not stem_dir.is_dir():
                    continue
                for csv_path in sorted(stem_dir.glob("P*T*.csv")):
                    findings.extend(validate_csv_structural(csv_path, stem_dir.name, year))

    return findings


# ── Pass 2: Cross-year consistency ──────────────────────────────────────

def parse_currency(s: str) -> float | None:
    """Parse a currency string like '1,234,567' or '(500)' into a float."""
    if not s or s.strip() in ("", "—", "—%"):
        return None
    cleaned = s.replace(",", "").replace("$", "").replace("%", "").strip()
    negative = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = cleaned[1:-1]
        negative = True
    try:
        val = float(cleaned)
        return -val if negative else val
    except ValueError:
        return None


def run_cross_year(
    year_a: int,
    year_b: int,
    *,
    prefix_override_a: str | None = None,
    prefix_override_b: str | None = None,
) -> list[Finding]:
    """Compare overlapping budget columns between two years' built JSON data."""
    findings: list[Finding] = []
    data_dir = web_data_dir()
    views = data_dir / "views"

    # Determine which year's data has a prefix
    prefix_a = bundle_prefix(year=year_a, override=prefix_override_a)
    prefix_b = bundle_prefix(year=year_b, override=prefix_override_b)

    path_a = views / f"{prefix_a}department-budgets.json"
    path_b = views / f"{prefix_b}department-budgets.json"

    if not path_a.exists() or not path_b.exists():
        findings.append(Finding("ERROR", "CROSS-YEAR", "setup", f"missing data: {path_a.exists()=}, {path_b.exists()=}"))
        return findings

    data_a = json.load(open(path_a))
    data_b = json.load(open(path_b))

    def build_lookup(data: list[dict]) -> dict[str, dict[str, float]]:
        lookup: dict[str, dict[str, float]] = {}
        for row in data:
            dept = row["department"]
            if dept not in lookup:
                lookup[dept] = {}
            lookup[dept][row["year"]] = row["amount"]
        return lookup

    lookup_a = build_lookup(data_a)  # e.g., 2025 doc
    lookup_b = build_lookup(data_b)  # e.g., 2026 doc

    # The overlapping column: "{year_b - 1} Budget" should appear in both
    # year_a doc (as its current year) and year_b doc (as its prior year)
    overlap_col = f"{year_b - 1} Budget"

    all_depts = sorted(set(list(lookup_a.keys()) + list(lookup_b.keys())))

    for dept in all_depts:
        val_a = lookup_a.get(dept, {}).get(overlap_col)
        val_b = lookup_b.get(dept, {}).get(overlap_col)

        if val_a is not None and val_b is not None:
            diff = abs(val_b - val_a)
            if diff > 10:  # above rounding threshold
                ratio = max(val_b / val_a, val_a / val_b) if min(val_a, val_b) > 0 else 999
                if ratio > 5:
                    findings.append(Finding(
                        "ERROR", "CROSS-YEAR", dept,
                        f"{overlap_col}: ${val_a:,.0f} ({year_a} doc) vs ${val_b:,.0f} ({year_b} doc) — {ratio:.1f}x",
                    ))
                else:
                    findings.append(Finding(
                        "INFO", "CROSS-YEAR", dept,
                        f"{overlap_col}: ${val_a:,.0f} ({year_a} doc) vs ${val_b:,.0f} ({year_b} doc) — ${val_b - val_a:+,.0f}",
                    ))
        elif val_a is not None and val_b is None:
            findings.append(Finding("WARN", "CROSS-YEAR", dept, f"in {year_a} doc only ({overlap_col}: ${val_a:,.0f})"))
        elif val_b is not None and val_a is None:
            findings.append(Finding("WARN", "CROSS-YEAR", dept, f"in {year_b} doc only ({overlap_col}: ${val_b:,.0f})"))

    return findings


# ── Pass 3: Statistical outliers ────────────────────────────────────────

def run_outliers(year: int, *, prefix_override: str | None = None) -> list[Finding]:
    """Flag statistical anomalies in built JSON for a single year."""
    findings: list[Finding] = []
    data_dir = web_data_dir()
    views = data_dir / "views"

    prefix = bundle_prefix(year=year, override=prefix_override)
    budgets_path = views / f"{prefix}department-budgets.json"

    if not budgets_path.exists():
        findings.append(Finding("ERROR", "OUTLIER", "setup", f"missing {budgets_path}"))
        return findings

    data = json.load(open(budgets_path))

    # Group by department, get current year budget
    current_col = f"{year} Budget"
    prior_col = f"{year - 1} Budget"
    dept_budgets: dict[str, dict[str, float]] = {}
    for row in data:
        dept = row["department"]
        if dept not in dept_budgets:
            dept_budgets[dept] = {}
        dept_budgets[dept][row["year"]] = row["amount"]

    # Get current year amounts
    current_amounts = {d: v.get(current_col) for d, v in dept_budgets.items() if v.get(current_col)}
    if not current_amounts:
        findings.append(Finding("WARN", "OUTLIER", "setup", f"no departments with '{current_col}' column"))
        return findings

    median = sorted(current_amounts.values())[len(current_amounts) // 2]

    for dept, amount in sorted(current_amounts.items()):
        # Tiny budget (< 1% of median)
        if amount < median * 0.01 and median > 0:
            findings.append(Finding(
                "WARN", "OUTLIER", dept,
                f"{current_col} ${amount:,.0f} is <1% of median ${median:,.0f} — possible subtotal",
            ))

        # Huge year-over-year swing
        prior = dept_budgets[dept].get(prior_col)
        if prior and prior > 0:
            pct = abs(amount - prior) / prior * 100
            if pct > 50:
                findings.append(Finding(
                    "INFO", "OUTLIER", dept,
                    f"{pct:.0f}% change: {prior_col} ${prior:,.0f} → {current_col} ${amount:,.0f}",
                ))

    # Completeness: check sections.json vs departments with data
    sp = best_sections_path(year, "operating")
    if sp is not None:
        with open(sp) as f:
            sections = json.load(f)
        section_titles = {s["title"] for s in sections}
        dept_titles = set(dept_budgets.keys())
        # Only check department sections (skip overview sections by checking if title
        # matches a known overview pattern)
        overview_keywords = {"legislation", "rescue plan", "guide", "forecast", "summary",
                             "narrative", "detail", "organization chart", "salary",
                             "debt service", "pension", "fee schedule", "appendic",
                             "other special revenue", "grants"}
        for title in sorted(section_titles):
            if any(kw in title.lower() for kw in overview_keywords):
                continue
            if title not in dept_titles:
                findings.append(Finding(
                    "INFO", "MISSING", title,
                    f"section exists in sections.json but no budget row in built data",
                ))

    return findings


# ── Main ────────────────────────────────────────────────────────────────

def print_report(findings: list[Finding], known: set[str]) -> tuple[int, int, int]:
    """Print findings, returning (errors, warnings, suppressed) counts."""
    errors = warnings = suppressed = 0

    for f in findings:
        if f.key in known:
            suppressed += 1
            continue
        print(f)
        if f.severity == "ERROR":
            errors += 1
        elif f.severity == "WARN":
            warnings += 1

    return errors, warnings, suppressed


PREFIX_HELP: str = (
    "Prefix of the built JSON bundle to validate, e.g. 'scratch2027' (default: none for the "
    f"default year {DEFAULT_YEAR}, '{{year}}-' otherwise)"
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Post-extraction data validation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s structural --year 2025
  %(prog)s structural --year 2025 --source expected
  %(prog)s cross-year --years 2025,2026
  %(prog)s outliers --year 2025
  %(prog)s all --year 2025
  %(prog)s suppress "STRUCTURAL:27_Bureau_of_Fire/P5T0:header has 8 cols"
""",
    )
    sub = parser.add_subparsers(dest="command")

    # structural
    sp = sub.add_parser("structural", help="Check raw CSVs for extraction anomalies")
    sp.add_argument("--year", type=int, default=DEFAULT_YEAR)
    sp.add_argument("--source", choices=["debug", "expected"], default="expected",
                     help="Check debug or expected CSVs (default: expected)")
    sp.add_argument("--operating-variant", default="adopted", help="Operating variant for expected CSVs")
    sp.add_argument("--capital-variant", default="adopted", help="Capital variant for expected CSVs")

    # cross-year
    sp = sub.add_parser("cross-year", help="Compare overlapping columns between years")
    sp.add_argument("--years", required=True, help="Comma-separated pair, e.g., 2025,2026")
    sp.add_argument("--output-prefix-a", default=None, help="Bundle prefix for the first year (default: by year)")
    sp.add_argument("--output-prefix-b", default=None, help="Bundle prefix for the second year (default: by year)")

    # outliers
    sp = sub.add_parser("outliers", help="Flag statistical anomalies in built JSON")
    sp.add_argument("--year", type=int, default=DEFAULT_YEAR)
    sp.add_argument("--output-prefix", default=None, help=PREFIX_HELP)

    # all
    sp = sub.add_parser("all", help="Run all three passes")
    sp.add_argument("--year", type=int, default=DEFAULT_YEAR)
    sp.add_argument("--output-prefix", default=None, help=PREFIX_HELP)
    sp.add_argument("--operating-variant", default="adopted", help="Operating variant for expected CSVs")
    sp.add_argument("--capital-variant", default="adopted", help="Capital variant for expected CSVs")

    # suppress
    sp = sub.add_parser("suppress", help="Add a finding key to known issues")
    sp.add_argument("key", help="Finding key to suppress (from report output)")

    args = parser.parse_args()
    known = load_known_issues()

    if args.command == "suppress":
        known.add(args.key)
        save_known_issues(known)
        print(f"Suppressed: {args.key}")
        return

    if args.command is None:
        parser.print_help()
        return

    all_findings: list[Finding] = []

    if args.command in ("structural", "all"):
        year = args.year if hasattr(args, "year") else DEFAULT_YEAR
        source = args.source if hasattr(args, "source") else "expected"
        print(f"\n{'='*70}")
        print(f"  STRUCTURAL VALIDATION — {year} ({source})")
        print(f"{'='*70}\n")
        findings = run_structural(
            year,
            source,
            operating_variant=getattr(args, "operating_variant", "adopted"),
            capital_variant=getattr(args, "capital_variant", "adopted"),
        )
        errors, warnings, suppressed = print_report(findings, known)
        print(f"\n  {errors} errors, {warnings} warnings, {suppressed} suppressed\n")
        all_findings.extend(findings)

    if args.command == "cross-year" or args.command == "all":
        if args.command == "cross-year":
            years = [int(y) for y in args.years.split(",")]
        else:
            year = args.year if hasattr(args, "year") else DEFAULT_YEAR
            years_available = available_years()
            years = [y for y in years_available if y <= year]
            years = sorted(years)[-2:] if len(years) >= 2 else years

        if len(years) >= 2:
            print(f"\n{'='*70}")
            print(f"  CROSS-YEAR VALIDATION — {years[0]} vs {years[1]}")
            print(f"{'='*70}\n")
            findings = run_cross_year(
                years[0],
                years[1],
                prefix_override_a=getattr(args, "output_prefix_a", None),
                prefix_override_b=getattr(args, "output_prefix_b", None),
            )
            errors, warnings, suppressed = print_report(findings, known)
            print(f"\n  {errors} errors, {warnings} warnings, {suppressed} suppressed\n")
            all_findings.extend(findings)
        else:
            print("  Skipping cross-year: need at least 2 years")

    if args.command in ("outliers", "all"):
        year = args.year if hasattr(args, "year") else DEFAULT_YEAR
        print(f"\n{'='*70}")
        print(f"  OUTLIER DETECTION — {year}")
        print(f"{'='*70}\n")
        findings = run_outliers(year, prefix_override=getattr(args, "output_prefix", None))
        errors, warnings, suppressed = print_report(findings, known)
        print(f"\n  {errors} errors, {warnings} warnings, {suppressed} suppressed\n")
        all_findings.extend(findings)

    # Exit code
    total_errors = sum(1 for f in all_findings if f.severity == "ERROR" and f.key not in known)
    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
