"""Compare current spatial extractor output against expected CSVs to catch regressions."""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import available_years, debug_dir, expected_dir, split_pdf_dir
from utils.spatial_table_extractor import SpatialTableExtractor


def load_csv(path: Path) -> list[list[str]]:
    """Load a CSV file as a list of rows."""
    with open(path) as f:
        return list(csv.reader(f))


def find_pdf(stem: str, year: int, budget_type: str | None = None) -> Path | None:
    """Find a PDF matching the stem for a given year.

    When ``budget_type`` is given (which may be a variant like
    "operating-amended"), only that split dir is searched so amended
    baselines are compared against the amended PDF, not the adopted one.
    Otherwise all known budget types are scanned.
    """
    search_types = (budget_type,) if budget_type else ("operating", "capital")
    for bt in search_types:
        input_dir = split_pdf_dir(year, bt)
        if not input_dir.exists():
            continue
        candidates = list(input_dir.glob(f"*{stem}*.pdf"))
        if not candidates:
            candidates = list(input_dir.glob(f"*_{stem}.pdf"))
        for c in candidates:
            if stem in c.stem:
                return c
    return None


def run_regression_test(
    pdf_path: Path,
    expected: Path,
    debug: Path,
) -> bool:
    """Run the extractor on a PDF and compare against expected CSVs."""
    ext = SpatialTableExtractor()
    ext.render_debug(pdf_path, debug, csv_only=True)

    stem = pdf_path.stem
    actual_dir = debug / stem

    all_passed = True
    expected_files = sorted(expected.glob("P*T*.csv"))

    if not expected_files:
        print(f"  No expected files found in {expected}")
        return True

    for expected_path in expected_files:
        tag = expected_path.stem

        actual_path = actual_dir / expected_path.name
        if not actual_path.exists():
            print(f"  FAIL {tag}: debug CSV not generated")
            all_passed = False
            continue

        actual_rows = load_csv(actual_path)
        expected_rows = load_csv(expected_path)

        if actual_rows == expected_rows:
            print(f"  PASS {tag}")
        else:
            print(f"  FAIL {tag}")
            all_passed = False

            for i, (actual, expected_row) in enumerate(zip(actual_rows, expected_rows)):
                if actual != expected_row:
                    print(f"    Row {i} differs:")
                    print(f"      expected: {expected_row}")
                    print(f"      actual:   {actual}")
                    break
            if len(actual_rows) != len(expected_rows):
                print(f"    Row count: expected {len(expected_rows)}, got {len(actual_rows)}")

    return all_passed


def generate_all_debug_pdfs(year: int) -> None:
    """Generate debug output (CSVs + annotated PDFs) for all split PDFs of a year."""
    ext = SpatialTableExtractor()
    all_pdfs = []
    split_root = split_pdf_dir(year, "")
    if split_root.exists():
        for pdf_dir in sorted(split_root.iterdir()):
            if pdf_dir.is_dir():
                all_pdfs.extend(sorted(pdf_dir.glob("*.pdf")))

    if not all_pdfs:
        print(f"No PDFs found for year {year}.")
        return

    dbg = debug_dir(year)
    for pdf_path in all_pdfs:
        print(f"Generating debug for {pdf_path.name}...")
        try:
            ext.render_debug(pdf_path, dbg, csv_only=False)
        except Exception as e:
            print(f"  ERROR: {e}")

    print(f"\nGenerated debug output for {len(all_pdfs)} PDFs.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run regression tests for the spatial table extractor.")
    parser.add_argument("--pdf", action="store_true", help="Generate annotated debug PDFs for all split PDFs")
    parser.add_argument("--year", type=int, default=None, help="Test a specific year (default: all years)")
    args = parser.parse_args()

    years = [args.year] if args.year else available_years()
    if not years:
        print("No budget years found.")
        return

    if args.pdf:
        for year in years:
            generate_all_debug_pdfs(year)

    all_passed = True
    total_stems = 0

    for year in years:
        year_expected = expected_dir(year)
        if not year_expected.exists():
            continue

        print(f"\n{'='*60}")
        print(f"  YEAR {year}")
        print(f"{'='*60}")

        for budget_type_dir in sorted(year_expected.iterdir()):
            if not budget_type_dir.is_dir():
                continue

            budget_type = budget_type_dir.name
            stems = sorted(
                d.name for d in budget_type_dir.iterdir()
                if d.is_dir() and any(d.glob("P*T*.csv"))
            )

            if not stems:
                continue

            print(f"\n=== {budget_type.upper()} BUDGET ===")
            total_stems += len(stems)

            dbg = debug_dir(year)
            for stem in stems:
                pdf = find_pdf(stem, year, budget_type)
                if not pdf:
                    print(f"WARNING: PDF not found for {stem}")
                    continue

                print(f"Testing {stem} ({pdf.name})...")
                try:
                    if not run_regression_test(pdf, budget_type_dir / stem, dbg):
                        all_passed = False
                except Exception as e:
                    print(f"  ERROR: {e}")
                    all_passed = False

    if total_stems == 0:
        print("No expected test cases found.")
        return

    if all_passed:
        print(f"\nAll regression tests passed ({total_stems} PDFs).")
    else:
        print("\nSome tests FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    main()
