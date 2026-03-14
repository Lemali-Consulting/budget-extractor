"""Transform extracted CSVs and sections.json into JSON data bundles for the web app.

Outputs:
  - budget-data.json: Full section/table data for Astro build-time rendering
  - views/tables-index.json: Lightweight per-table metadata for explorer sidebar
  - views/department-budgets.json: Pre-aggregated budget totals per department/year
  - views/personnel.json: Pre-extracted personnel rows across all departments
  - views/search-index.json: Lightweight search items (no full row content)
"""

import csv
import json
import re
from pathlib import Path


INPUT_DIR = Path(__file__).parent.parent / "input"
OUTPUT_DIR = Path(__file__).parent.parent / "output" / "regression" / "expected"
GLOSSARY_PATH = Path(__file__).parent.parent / "output" / "glossary" / "glossary.json"
WEB_DATA_DIR = Path(__file__).parent.parent / "web" / "src" / "data"

# Pattern to extract section number and name from directory names like "10_City_Council"
DIR_PATTERN = re.compile(r"^(\d+)_(.+)$")

# Pattern to extract page and table index from filenames like "P2T0.csv"
FILE_PATTERN = re.compile(r"^P(\d+)T(\d+)\.csv$")


def slugify(title: str) -> str:
    """Convert a section title to a URL-friendly slug."""
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def parse_csv(path: Path) -> dict:
    """Parse a CSV file into a table dict with headers, rows, and optional sections.

    The first row contains debug column info (e.g., 'C0 (l, x:57-238)').
    The second row contains actual headers. Remaining rows are data.
    If the last column is 'section', it's stripped from headers/rows and
    returned as a parallel list of section labels.
    """
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        all_rows = list(reader)

    if len(all_rows) < 2:
        return {"headers": [], "rows": all_rows, "sections": []}

    coord_row = all_rows[0]
    headers = all_rows[1]
    data_rows = all_rows[2:]

    # Detect and strip the section column (always last if present)
    sections: list[str] = []
    if coord_row and coord_row[-1] == "section":
        coord_row = coord_row[:-1]
        headers = headers[:-1]  # strip "section" from display headers
        sections = [row.pop() if len(row) > len(headers) else "" for row in data_rows]

    return {"headers": headers, "rows": data_rows, "sections": sections}


def classify_table(headers: list[str]) -> str:
    """Classify a table by its header pattern."""
    header_text = " ".join(headers).lower()
    if "fte" in header_text and ("rate" in header_text or "grade" in header_text):
        return "personnel"
    if "revenue" in header_text:
        return "revenue"
    if "budget" in header_text and "actual" in header_text:
        return "financial_summary"
    if "budget" in header_text:
        return "financial"
    return "unknown"


def load_sections() -> dict[int, dict]:
    """Load sections.json and index by start_page for matching."""
    sections_path = INPUT_DIR / "sections.json"
    with open(sections_path, encoding="utf-8") as f:
        sections = json.load(f)

    # Build a lookup: section_number (from 1-indexed position) -> section info
    result: dict[int, dict] = {}
    for i, section in enumerate(sections, start=1):
        result[i] = {
            "title": section["title"],
            "start_page": section["start_page"],
            "end_page": section["end_page"],
        }
    return result


def parse_currency(s: str) -> float | None:
    """Parse a currency string like '$1,234,567' into a float."""
    if not s or s in ("—", "varies"):
        return None
    cleaned = re.sub(r"[$,()]", "", s).strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def build_data() -> dict:
    """Build the complete data bundle."""
    sections_lookup = load_sections()
    sections: list[dict] = []

    for dir_path in sorted(OUTPUT_DIR.iterdir()):
        if not dir_path.is_dir():
            continue

        match = DIR_PATTERN.match(dir_path.name)
        if not match:
            continue

        section_num = int(match.group(1))
        section_name = match.group(2).replace("_", " ")

        # Get section info from sections.json
        section_info = sections_lookup.get(section_num, {})
        title = section_info.get("title", section_name)
        start_page = section_info.get("start_page")

        tables: list[dict] = []
        for csv_path in sorted(dir_path.glob("*.csv")):
            file_match = FILE_PATTERN.match(csv_path.name)
            if not file_match:
                continue

            rel_page = int(file_match.group(1))
            table_idx = int(file_match.group(2))
            parsed = parse_csv(csv_path)
            table_type = classify_table(parsed["headers"])

            table: dict = {
                "id": f"s{section_num}_p{rel_page}_t{table_idx}",
                "relative_page": rel_page,
                "table_index": table_idx,
                "table_type": table_type,
                "headers": parsed["headers"],
                "rows": parsed["rows"],
            }
            if any(s != "" for s in parsed["sections"]):
                table["sections"] = parsed["sections"]

            if start_page is not None:
                table["absolute_page"] = start_page + rel_page

            tables.append(table)

        slug = slugify(title)
        sections.append({
            "section_number": section_num,
            "title": title,
            "slug": slug,
            "start_page": start_page,
            "end_page": section_info.get("end_page"),
            "tables": tables,
        })

    # Load glossary
    glossary: dict = {}
    if GLOSSARY_PATH.exists():
        with open(GLOSSARY_PATH, encoding="utf-8") as f:
            glossary = json.load(f)
        # Remove metadata key — not needed in frontend
        glossary.pop("metadata", None)

    return {"sections": sections, "glossary": glossary}


def build_department_budgets(sections: list[dict]) -> list[dict]:
    """Extract budget totals per department/year from financial tables."""
    rows: list[dict] = []

    for section in sections:
        for table in section["tables"]:
            if table["table_type"] not in ("financial_summary", "financial"):
                continue

            headers = table["headers"]
            budget_cols: list[dict] = []

            for i, h in enumerate(headers):
                m = re.search(r"(\d{4})\s*(Budget|Actual)", h, re.IGNORECASE)
                if m:
                    budget_cols.append({
                        "year": f"{m.group(1)} {m.group(2)}",
                        "idx": i,
                    })

            if not budget_cols:
                continue

            # Find a "total" row
            for row in table["rows"]:
                label = (row[0] if row else "").lower()
                if "total" in label and "subtotal" not in label:
                    for col in budget_cols:
                        amount = parse_currency(row[col["idx"]] if col["idx"] < len(row) else "")
                        if amount and amount > 0:
                            rows.append({
                                "department": section["title"],
                                "slug": section["slug"],
                                "year": col["year"],
                                "amount": amount,
                            })
                    break

    return rows


def build_personnel(sections: list[dict]) -> list[dict]:
    """Extract personnel rows from all personnel tables."""
    rows: list[dict] = []

    for section in sections:
        for table in section["tables"]:
            if table["table_type"] != "personnel":
                continue

            headers = [h.lower() for h in table["headers"]]

            title_idx = next((i for i, h in enumerate(headers) if "title" in h), -1)
            fte_2025_idx = next((i for i, h in enumerate(headers) if "2025" in h and "fte" in h), -1)
            fte_2026_idx = next((i for i, h in enumerate(headers) if "2026" in h and "fte" in h), -1)
            budget_2025_idx = next((i for i, h in enumerate(headers) if "2025" in h and "budget" in h), -1)
            budget_2026_idx = next((i for i, h in enumerate(headers) if "2026" in h and "budget" in h), -1)
            rate_idx = next((i for i, h in enumerate(headers) if "rate" in h or "grade" in h), -1)

            if title_idx < 0:
                continue

            for row in table["rows"]:
                title = row[title_idx] if title_idx < len(row) else ""
                if not title or "total" in title.lower():
                    continue

                def cell(idx: int) -> str:
                    return row[idx] if 0 <= idx < len(row) else ""

                rows.append({
                    "department": section["title"],
                    "slug": section["slug"],
                    "title": title,
                    "fte2025": parse_currency(cell(fte_2025_idx)),
                    "fte2026": parse_currency(cell(fte_2026_idx)),
                    "budget2025": parse_currency(cell(budget_2025_idx)),
                    "budget2026": parse_currency(cell(budget_2026_idx)),
                    "rateGrade": cell(rate_idx),
                })

    return rows


def detect_numeric_columns(headers: list[str], rows: list[list[str]]) -> list[int]:
    """Detect which columns contain primarily numeric/currency data."""
    if not rows or not headers:
        return []
    num_cols = len(headers)
    numeric_counts = [0] * num_cols
    total_counts = [0] * num_cols

    for row in rows:
        for i, cell in enumerate(row):
            if i >= num_cols:
                break
            if cell and cell.strip() and cell.strip() != "—":
                total_counts[i] += 1
                if parse_currency(cell) is not None:
                    numeric_counts[i] += 1

    return [
        i for i in range(num_cols)
        if total_counts[i] > 0 and numeric_counts[i] / total_counts[i] > 0.5
    ]


def build_tables_index(sections: list[dict]) -> list[dict]:
    """Build lightweight metadata index for all tables (no row data)."""
    items: list[dict] = []

    for section in sections:
        for table in section["tables"]:
            numeric_cols = detect_numeric_columns(table["headers"], table["rows"])
            items.append({
                "id": table["id"],
                "sectionNumber": section["section_number"],
                "sectionTitle": section["title"],
                "sectionSlug": section["slug"],
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
                "type": table["table_type"],
                "headers": table["headers"],
                "rowCount": len(table["rows"]),
                "numericCols": numeric_cols,
            })

    return items


def build_search_index(sections: list[dict]) -> list[dict]:
    """Build a lightweight search index — section titles and table headers only, no row content."""
    items: list[dict] = []

    for section in sections:
        # Section-level entry
        items.append({
            "sectionTitle": section["title"],
            "slug": section["slug"],
            "tableId": "",
            "tableType": "",
            "headers": "",
            "page": 0,
            "tableIndex": -1,
        })

        for table in section["tables"]:
            items.append({
                "sectionTitle": section["title"],
                "slug": section["slug"],
                "tableId": table["id"],
                "tableType": table["table_type"],
                "headers": " ".join(table["headers"]),
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
            })

    return items


def main() -> None:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    views_dir = WEB_DATA_DIR / "views"
    views_dir.mkdir(parents=True, exist_ok=True)

    data = build_data()
    sections = data["sections"]

    # Full data bundle (for Astro build-time rendering of section detail pages)
    out_path = WEB_DATA_DIR / "budget-data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {out_path} ({len(sections)} sections)")

    # Tables index (lightweight metadata for explorer sidebar)
    tables_index = build_tables_index(sections)
    with open(views_dir / "tables-index.json", "w", encoding="utf-8") as f:
        json.dump(tables_index, f, indent=2)
    print(f"Wrote tables-index.json ({len(tables_index)} tables)")

    # Pre-computed views for client-side components
    dept_budgets = build_department_budgets(sections)
    with open(views_dir / "department-budgets.json", "w", encoding="utf-8") as f:
        json.dump(dept_budgets, f, indent=2)
    print(f"Wrote department-budgets.json ({len(dept_budgets)} rows)")

    personnel = build_personnel(sections)
    with open(views_dir / "personnel.json", "w", encoding="utf-8") as f:
        json.dump(personnel, f, indent=2)
    print(f"Wrote personnel.json ({len(personnel)} rows)")

    search_index = build_search_index(sections)
    with open(views_dir / "search-index.json", "w", encoding="utf-8") as f:
        json.dump(search_index, f, indent=2)
    print(f"Wrote search-index.json ({len(search_index)} items)")


if __name__ == "__main__":
    main()
