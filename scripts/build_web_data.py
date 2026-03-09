"""Transform extracted CSVs and sections.json into a JSON data bundle for the web app."""

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
    """Parse a CSV file into a table dict with headers and rows.

    The first row contains debug column info (e.g., 'C0 (l, x:57-238)').
    The second row contains actual headers. Remaining rows are data.
    """
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        all_rows = list(reader)

    if len(all_rows) < 2:
        return {"headers": [], "rows": all_rows}

    headers = all_rows[1]
    data_rows = all_rows[2:]

    return {"headers": headers, "rows": data_rows}


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

            if start_page is not None:
                table["absolute_page"] = start_page + rel_page - 1

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


def main() -> None:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = build_data()
    out_path = WEB_DATA_DIR / "budget-data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {out_path} ({len(data['sections'])} sections)")


if __name__ == "__main__":
    main()
