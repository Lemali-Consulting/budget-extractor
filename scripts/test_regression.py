"""Compare current spatial extractor output against expected CSVs to catch regressions."""

import csv
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.spatial_table_extractor import SpatialTableExtractor

# Directories to search for source PDFs (in priority order)
INPUT_DIRS = [
    "input/split-pdf-revised",
    "input/split-pdf",
]


def load_csv(path: Path) -> list[list[str]]:
    """Load a CSV file as a list of rows."""
    with open(path) as f:
        return list(csv.reader(f))


def find_pdf(stem: str, project_root: Path) -> Path | None:
    """Find a PDF matching the stem across input directories."""
    for input_dir in INPUT_DIRS:
        # Try exact match first, then glob for numbered prefix variants
        candidates = list((project_root / input_dir).glob(f"*{stem}*.pdf"))
        if not candidates:
            candidates = list((project_root / input_dir).glob(f"*_{stem}.pdf"))
        for c in candidates:
            # Ensure the stem is a suffix match (e.g., "52_Mellon..." matches "Mellon...")
            if stem in c.stem:
                return c
    return None


def run_regression_test(
    pdf_path: Path,
    expected_dir: Path,
    debug_dir: Path,
) -> bool:
    """
    Run the extractor on a PDF and compare against expected CSVs.

    Regenerates debug CSVs via render_debug, then compares them against
    expected outputs. Returns True if all expected files match.
    """
    ext = SpatialTableExtractor()

    # Regenerate debug CSVs (skip the annotated PDF for speed)
    ext.render_debug(pdf_path, debug_dir, csv_only=True)

    stem = pdf_path.stem
    actual_dir = debug_dir / stem

    all_passed = True
    expected_files = sorted(expected_dir.glob("P*T*.csv"))

    if not expected_files:
        print(f"  No expected files found in {expected_dir}")
        return True

    for expected_path in expected_files:
        tag = expected_path.stem  # e.g., "P0T1"

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

            # Show first difference
            for i, (actual, expected) in enumerate(zip(actual_rows, expected_rows)):
                if actual != expected:
                    print(f"    Row {i} differs:")
                    print(f"      expected: {expected}")
                    print(f"      actual:   {actual}")
                    break
            if len(actual_rows) != len(expected_rows):
                print(f"    Row count: expected {len(expected_rows)}, got {len(actual_rows)}")

    return all_passed


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    expected_dir = project_root / "output" / "regression" / "expected"
    debug_dir = project_root / "output" / "regression" / "debug"

    if not expected_dir.exists():
        print("No expected directory found.")
        return

    # Each subdirectory in expected/ corresponds to a PDF stem
    stems = sorted(
        d.name for d in expected_dir.iterdir()
        if d.is_dir() and any(d.glob("P*T*.csv"))
    )

    if not stems:
        print("No expected test cases found.")
        return

    all_passed = True
    for stem in stems:
        pdf_path = find_pdf(stem, project_root)
        if not pdf_path:
            print(f"WARNING: PDF not found for {stem}")
            continue

        print(f"Testing {stem} ({pdf_path.name})...")
        if not run_regression_test(pdf_path, expected_dir / stem, debug_dir):
            all_passed = False

    if all_passed:
        print(f"\nAll regression tests passed ({len(stems)} PDFs).")
    else:
        print("\nSome tests FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    main()
