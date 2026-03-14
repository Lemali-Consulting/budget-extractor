"""Detect section headers in regression CSV files and report findings."""

import csv
import re
from pathlib import Path

EXPECTED_DIR = Path("output/regression/expected")

# Pattern A: Expense/revenue category codes like "51 - PERSONNEL-SALARIES & WAGES"
CATEGORY_CODE_RE = re.compile(r"^\d{2}\s*-\s+[A-Z]")

# Pattern B: "Expenditures Total" or "Total ..." rows (subtotals, not sections)
TOTAL_RE = re.compile(r"^(Total |Expenditures Total|Revenues Total)", re.IGNORECASE)

# Pattern C: Standalone all-caps labels like "REVENUES", "EXPENDITURES"
ALLCAPS_LABEL_RE = re.compile(r"^[A-Z][A-Z &/\-]{2,}$")

# Pattern D: "BUREAU OF ..." or "DEPARTMENT OF ..." headers (fee schedules)
BUREAU_DEPT_RE = re.compile(r"^(BUREAU OF |DEPARTMENT OF |OFFICE OF )", re.IGNORECASE)

# False positive filters: date-only rows, line items with "Transfer to/for"
DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")
TRANSFER_RE = re.compile(r"^Transfer (to|for) ", re.IGNORECASE)


def is_rest_empty(row: list[str], start: int = 1) -> bool:
    """Check if all columns from start onward are empty."""
    return all(cell.strip() == "" for cell in row[start:])


def detect_sections_in_csv(csv_path: Path) -> list[dict]:
    """Detect section header rows in a single CSV file.

    Returns list of dicts with row_num, text, pattern_type.
    """
    sections: list[dict] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if len(rows) < 2:
        return sections

    # Find the coordinate header row (C0, C1, ...)
    coord_row_idx: int | None = None
    for i, row in enumerate(rows):
        if row and (row[0].startswith("C0") or row[0].startswith('"C0')):
            coord_row_idx = i
            break
        if i == 0 and row and "x:" in row[0]:
            coord_row_idx = 0
            break

    # Data starts after coord row + column name row, but we also need to
    # check if index coord_row_idx+1 is itself a section header (e.g.,
    # "BUREAU OF FIRE" before "Fee Description,2026")
    if coord_row_idx is not None:
        data_start = coord_row_idx + 2
        # Check if row at coord_row_idx+1 is a bureau/dept header
        # (it would be misidentified as the column name row otherwise)
        maybe_header_idx = coord_row_idx + 1
        if maybe_header_idx < len(rows):
            candidate = rows[maybe_header_idx]
            if candidate and len(candidate) > 0:
                cell = candidate[0].strip()
                if BUREAU_DEPT_RE.match(cell) and is_rest_empty(candidate, 1):
                    # This is a section header, not a column name row.
                    # Actual column names are at coord_row_idx+2.
                    data_start = coord_row_idx + 1  # include this row
    else:
        data_start = 1

    for i, row in enumerate(rows):
        if i < data_start or not row:
            continue

        first_cell = row[0].strip()
        if not first_cell:
            continue

        # Pattern A: Category code headers (e.g., "51 - PERSONNEL-SALARIES & WAGES")
        if CATEGORY_CODE_RE.match(first_cell):
            sections.append({
                "row_num": i + 1,
                "text": first_cell,
                "pattern": "category_code",
            })
            continue

        # Skip total/subtotal rows — these are NOT section headers
        if TOTAL_RE.match(first_cell):
            continue

        # Pattern B: Text-only row where all other columns are empty
        if len(row) > 1 and is_rest_empty(row, start=1):
            # Filter out notes/footnotes
            if first_cell.startswith("*") or first_cell.startswith("Note:"):
                continue
            # Filter out coordinate header rows
            if "x:" in first_cell:
                continue
            # Filter out date-only data rows (debt service schedules)
            if DATE_RE.match(first_cell):
                continue
            # Filter out "Transfer to/for ..." line items with zero values
            if TRANSFER_RE.match(first_cell):
                continue

            # Subcategorize
            if BUREAU_DEPT_RE.match(first_cell):
                pattern = "bureau_dept_header"
            elif ALLCAPS_LABEL_RE.match(first_cell):
                pattern = "allcaps_label"
            else:
                pattern = "text_only_header"

            sections.append({
                "row_num": i + 1,
                "text": first_cell,
                "pattern": pattern,
            })

    return sections


def main() -> None:
    results: dict[str, list[dict]] = {}
    all_csvs = sorted(EXPECTED_DIR.rglob("*.csv"))

    for csv_path in all_csvs:
        rel = csv_path.relative_to(EXPECTED_DIR)
        sections = detect_sections_in_csv(csv_path)
        if sections:
            results[str(rel)] = sections

    # Print results
    print(f"Scanned {len(all_csvs)} CSVs, found sections in {len(results)}:\n")

    csvs_with_sections: list[str] = []
    csvs_without_sections: list[str] = []

    for csv_path in all_csvs:
        rel = str(csv_path.relative_to(EXPECTED_DIR))
        if rel in results:
            csvs_with_sections.append(rel)
        else:
            csvs_without_sections.append(rel)

    print("=" * 70)
    print("CSVs WITH detected sections:")
    print("=" * 70)
    for rel in csvs_with_sections:
        sections = results[rel]
        patterns = set(s["pattern"] for s in sections)
        texts = [s["text"][:60] for s in sections]
        print(f"\n  {rel}  [{', '.join(patterns)}]")
        for s in sections:
            print(f"    row {s['row_num']:3d}: [{s['pattern']}] {s['text'][:70]}")

    print(f"\n{'=' * 70}")
    print("CSVs WITHOUT detected sections:")
    print("=" * 70)
    for rel in csvs_without_sections:
        print(f"  {rel}")

    # Summary by pattern type
    print(f"\n{'=' * 70}")
    print("Summary by pattern type:")
    print("=" * 70)
    pattern_counts: dict[str, int] = {}
    for sections in results.values():
        for s in sections:
            pattern_counts[s["pattern"]] = pattern_counts.get(s["pattern"], 0) + 1
    for pat, count in sorted(pattern_counts.items()):
        print(f"  {pat}: {count} occurrences")


if __name__ == "__main__":
    main()
