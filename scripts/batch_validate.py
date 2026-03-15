"""Batch-run the spatial extractor on all split PDFs and flag tables needing manual review."""

import argparse
import csv
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import DEFAULT_YEAR, available_years, debug_dir, expected_dir, split_pdf_dir
from utils.spatial_table_extractor import SpatialTableExtractor


@dataclass
class TableReport:
    """Validation report for a single extracted table."""
    pdf_stem: str
    page: int
    table: int
    num_cols: int
    num_rows: int  # data rows, excluding header
    headers: list[str]
    warnings: list[str] = field(default_factory=list)

    @property
    def tag(self) -> str:
        return f"P{self.page}T{self.table}"

    @property
    def ok(self) -> bool:
        return len(self.warnings) == 0


def load_csv(path: Path) -> list[list[str]]:
    with open(path) as f:
        return list(csv.reader(f))


def validate_csv(path: Path, pdf_stem: str, page: int, table: int) -> TableReport:
    """Run heuristic checks on a single CSV and return a report."""
    rows = load_csv(path)
    if not rows:
        return TableReport(pdf_stem, page, table, 0, 0, [], ["empty CSV"])

    # Row 0 is column metadata (e.g. "C0 (l, x:57-240)"), row 1 is header, rest is data
    col_meta = rows[0]
    num_cols = len(col_meta)
    headers = rows[1] if len(rows) > 1 else []
    data_rows = rows[2:] if len(rows) > 2 else []

    report = TableReport(pdf_stem, page, table, num_cols, len(data_rows), headers)

    # --- Check 1: Single-column table (likely prose or false positive) ---
    if num_cols == 1:
        report.warnings.append("single-column table (likely prose/false positive)")
        return report

    # --- Check 2: Very few data rows ---
    if len(data_rows) == 0:
        report.warnings.append("no data rows (header only)")
    elif len(data_rows) == 1:
        report.warnings.append("only 1 data row")

    # --- Check 3: Cells containing multiple whitespace-separated numbers ---
    # This indicates a merge failure (two values in one cell)
    merge_patterns = [
        re.compile(r'[\d,]+\.?\d*\s{2,}[\d,]+\.?\d*'),           # two plain numbers
        re.compile(r'\([\d,]+\)\s+\(?[\d.]+\)?%'),                # (6,288) (31.5)%
        re.compile(r'[\d,]+\.?\d*\s{2,}\d+\.?\d*%'),              # 125,062  3.5%
    ]
    merge_cells: list[str] = []
    for r_idx, row in enumerate(data_rows):
        for c_idx, cell in enumerate(row):
            if any(p.search(cell) for p in merge_patterns):
                merge_cells.append(f"R{r_idx+2}C{c_idx}: '{cell}'")
    if merge_cells:
        examples = merge_cells[:3]
        report.warnings.append(f"possible merged cells ({len(merge_cells)} total): {examples}")

    # --- Check 4: Inconsistent column counts across rows ---
    bad_col_rows = 0
    for row in data_rows:
        if len(row) != num_cols:
            bad_col_rows += 1
    if bad_col_rows > 0:
        report.warnings.append(f"{bad_col_rows}/{len(data_rows)} rows have wrong column count")

    # --- Check 5: Suspected page number leak ---
    # Last row is a single number (no commas, no decimals, 1-3 digits)
    if data_rows:
        last_row = data_rows[-1]
        non_empty = [c for c in last_row if c.strip()]
        if len(non_empty) == 1 and re.fullmatch(r'\d{1,3}', non_empty[0].strip()):
            report.warnings.append(f"last row looks like a page number: '{non_empty[0].strip()}'")

    # --- Check 6: Low multi-column utilization ---
    # If most rows only use 1-2 columns, the table may be a false positive
    if num_cols >= 3 and len(data_rows) >= 3:
        sparse_rows = 0
        for row in data_rows:
            non_empty_count = sum(1 for c in row if c.strip())
            if non_empty_count <= 1:
                sparse_rows += 1
        ratio = sparse_rows / len(data_rows)
        if ratio > 0.7:
            report.warnings.append(f"{sparse_rows}/{len(data_rows)} rows have <=1 non-empty cell (sparse)")

    # --- Check 7: Prose text captured as table data ---
    # If early data rows have long text (>100 chars) in C0 and empty other columns, likely prose
    if num_cols >= 2 and len(data_rows) >= 3:
        prose_rows = 0
        for row in data_rows[:10]:  # check first 10 rows
            if row and len(row[0]) > 100 and all(c.strip() == '' for c in row[1:]):
                prose_rows += 1
        if prose_rows >= 2:
            report.warnings.append(f"first rows look like prose ({prose_rows} long text-only rows)")

    # --- Check 8: Dollar sign leftover (should have been stripped) ---
    for r_idx, row in enumerate(data_rows):
        for c_idx, cell in enumerate(row):
            if '$' in cell:
                report.warnings.append(f"dollar sign in R{r_idx+2}C{c_idx}: '{cell}'")
                break
        else:
            continue
        break  # only report once

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch-validate spatial extractor output.")
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, help=f"Budget year (default: {DEFAULT_YEAR})")
    args = parser.parse_args()

    year = args.year
    dbg = debug_dir(year)

    # Collect all split PDFs for this year
    pdfs = []
    for budget_type in ("operating", "capital"):
        pdf_dir = split_pdf_dir(year, budget_type)
        if pdf_dir.exists():
            pdfs.extend(sorted(pdf_dir.glob("*.pdf")))

    if not pdfs:
        print(f"No split PDFs found for year {year}. Run scripts/split_pdf.py first.")
        sys.exit(1)

    print(f"Found {len(pdfs)} split PDFs.\n")

    ext = SpatialTableExtractor()

    # Collect all baselined stems across budget types
    already_baselined: set[str] = set()
    for budget_type in ("operating", "capital"):
        exp = expected_dir(year, budget_type)
        if exp.exists():
            already_baselined.update(d.name for d in exp.iterdir() if d.is_dir())

    all_reports: list[TableReport] = []
    pdf_summaries: list[tuple[str, int, int, bool]] = []  # (stem, tables, warnings, baselined)

    for pdf_path in pdfs:
        stem = pdf_path.stem
        is_baselined = stem in already_baselined
        status_tag = " [baselined]" if is_baselined else ""

        # Generate debug CSVs
        try:
            ext.render_debug(pdf_path, dbg, csv_only=True)
        except Exception as e:
            print(f"ERROR extracting {stem}: {e}")
            pdf_summaries.append((stem, 0, 1, is_baselined))
            continue

        # Find generated CSVs
        csv_dir = dbg / stem
        if not csv_dir.exists():
            pdf_summaries.append((stem, 0, 0, is_baselined))
            continue

        csv_files = sorted(csv_dir.glob("P*T*.csv"))
        pdf_warnings = 0

        for csv_path in csv_files:
            # Parse P{page}T{table} from filename
            m = re.match(r'P(\d+)T(\d+)\.csv', csv_path.name)
            if not m:
                continue
            page, table = int(m.group(1)), int(m.group(2))
            report = validate_csv(csv_path, stem, page, table)
            all_reports.append(report)
            if not report.ok:
                pdf_warnings += 1

        pdf_summaries.append((stem, len(csv_files), pdf_warnings, is_baselined))

    # ── Print summary ──────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("BATCH VALIDATION SUMMARY")
    print("=" * 80)

    clean_not_baselined: list[str] = []
    needs_review: list[str] = []
    no_tables: list[str] = []

    for stem, table_count, warning_count, is_baselined in pdf_summaries:
        if table_count == 0:
            no_tables.append(stem)
        elif warning_count > 0 and not is_baselined:
            needs_review.append(stem)
        elif not is_baselined and warning_count == 0:
            clean_not_baselined.append(stem)

    print(f"\nTotal PDFs: {len(pdfs)}")
    print(f"Already baselined: {sum(1 for _, _, _, b in pdf_summaries if b)}")
    print(f"Clean (no warnings, ready to baseline): {len(clean_not_baselined)}")
    print(f"Need review (has warnings): {len(needs_review)}")
    print(f"No tables extracted: {len(no_tables)}")

    if clean_not_baselined:
        print(f"\n── CLEAN — ready to baseline ({len(clean_not_baselined)}) ──")
        for stem in clean_not_baselined:
            count = next(tc for s, tc, _, _ in pdf_summaries if s == stem)
            print(f"  {stem} ({count} tables)")

    if needs_review:
        print(f"\n── NEEDS REVIEW ({len(needs_review)}) ──")
        for stem in needs_review:
            count = next(tc for s, tc, _, _ in pdf_summaries if s == stem)
            warnings = next(wc for s, _, wc, _ in pdf_summaries if s == stem)
            print(f"  {stem} ({count} tables, {warnings} with warnings)")

    if no_tables:
        print(f"\n── NO TABLES ({len(no_tables)}) ──")
        for stem in no_tables:
            print(f"  {stem}")

    # ── Detailed warnings ──────────────────────────────────────────
    flagged = [r for r in all_reports if not r.ok and not r.pdf_stem in already_baselined]
    if flagged:
        print(f"\n{'=' * 80}")
        print("DETAILED WARNINGS (non-baselined PDFs only)")
        print("=" * 80)
        current_stem = ""
        for r in flagged:
            if r.pdf_stem != current_stem:
                current_stem = r.pdf_stem
                print(f"\n  {current_stem}:")
            for w in r.warnings:
                print(f"    {r.tag}: {w}")

    # ── Also flag baselined PDFs with warnings (potential regressions) ──
    baselined_flagged = [r for r in all_reports if not r.ok and r.pdf_stem in already_baselined]
    if baselined_flagged:
        print(f"\n{'=' * 80}")
        print("WARNINGS IN BASELINED PDFs (may indicate known issues)")
        print("=" * 80)
        current_stem = ""
        for r in baselined_flagged:
            if r.pdf_stem != current_stem:
                current_stem = r.pdf_stem
                print(f"\n  {current_stem}:")
            for w in r.warnings:
                print(f"    {r.tag}: {w}")

    print()


if __name__ == "__main__":
    main()
