"""Transform extracted CSVs and sections JSON into JSON data bundles for the web app.

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
import sys
from pathlib import Path

# Allow importing from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

INPUT_DIR = Path(__file__).parent.parent / "input"
OPERATING_OUTPUT_DIR = Path(__file__).parent.parent / "output" / "regression" / "expected" / "operating"
CAPITAL_OUTPUT_DIR = Path(__file__).parent.parent / "output" / "regression" / "expected" / "capital"
GLOSSARY_PATH = Path(__file__).parent.parent / "output" / "glossary" / "glossary.json"
PDF_PATH = INPUT_DIR / "2026-operating-budget.pdf"
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
    """Load sections JSON and index by start_page for matching."""
    sections_path = INPUT_DIR / "sections-operating.json"
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


def extract_narrative_content(
    sections_lookup: dict[int, dict],
) -> tuple[dict[int, list[dict]], dict[tuple[int, int, int], list[dict]]]:
    """Extract narrative text blocks, chart regions, and table bboxes per section.

    Returns:
      - dict mapping section_number -> list of page content dicts with:
        relative_page, absolute_page, text_blocks [{text, role, bbox}],
        chart_regions [{bbox, chart_type}]
      - dict mapping (section_number, rel_page, table_index) -> list of linked
        narrative text blocks spatially associated with that table
    """
    if not PDF_PATH.exists():
        print(f"  Skipping narrative extraction: {PDF_PATH} not found")
        return {}, {}

    import pdfplumber
    from utils.spatial_table_extractor import SpatialTableExtractor

    ext = SpatialTableExtractor()
    pdf = pdfplumber.open(str(PDF_PATH))
    result: dict[int, list[dict]] = {}
    narrative_links: dict[tuple[int, int, int], list[dict]] = {}

    USEFUL_ROLES = {"narrative", "section_title", "leading_prose", "trailing_prose",
                    "mid_table_prose", "footnote"}
    LINKABLE_ROLES = {"narrative", "leading_prose", "mid_table_prose"}

    for sec_num, info in sorted(sections_lookup.items()):
        start = info["start_page"]
        end = info["end_page"]
        pages_content: list[dict] = []

        for abs_page in range(start, end + 1):
            if abs_page < 1 or abs_page > len(pdf.pages):
                continue
            page = pdf.pages[abs_page - 1]
            rel_page = abs_page - start

            try:
                tables, content = ext.extract_page_content(page)
            except Exception as e:
                print(f"  Warning: page {abs_page}: {e}")
                continue

            blocks = [
                {"text": b.text, "role": b.role, "bbox": [round(v, 1) for v in b.bbox]}
                for b in content.text_blocks if b.role in USEFUL_ROLES
            ]
            charts = [
                {"bbox": [round(v, 1) for v in c.bbox], "chart_type": c.chart_type}
                for c in content.chart_regions
            ]

            # Link narrative blocks to their nearest table using spatial proximity.
            # A text block is linked to the table whose top edge is closest below it,
            # or above it if no table is below.
            table_bboxes = [
                (i, t.bbox) for i, t in enumerate(tables) if t.bbox
            ]
            linkable = [b for b in blocks if b["role"] in LINKABLE_ROLES]

            for block in linkable:
                block_bottom = block["bbox"][3]  # y1 of text block
                block_top = block["bbox"][1]

                best_table_idx: int | None = None
                best_dist = float("inf")

                for t_idx, t_bbox in table_bboxes:
                    table_top = t_bbox[1]
                    table_bottom = t_bbox[3]

                    # Prefer tables below the text (text introduces the table)
                    if table_top >= block_top:
                        dist = table_top - block_bottom
                    else:
                        # Table is above — text follows the table
                        dist = block_top - table_bottom + 1000  # penalize

                    if dist < best_dist:
                        best_dist = dist
                        best_table_idx = t_idx

                if best_table_idx is not None and best_dist < 1200:
                    key = (sec_num, rel_page, best_table_idx)
                    narrative_links.setdefault(key, []).append(block)

            if blocks or charts:
                pages_content.append({
                    "relative_page": rel_page,
                    "absolute_page": abs_page,
                    "text_blocks": blocks,
                    "chart_regions": charts,
                })

        if pages_content:
            result[sec_num] = pages_content

    pdf.close()
    return result, narrative_links


def load_descriptions() -> dict[str, str]:
    """Load pre-generated table descriptions if available."""
    desc_path = Path(__file__).parent.parent / "output" / "table-descriptions.json"
    if desc_path.exists():
        with open(desc_path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def build_data() -> dict:
    """Build the complete data bundle."""
    sections_lookup = load_sections()

    print("Extracting narrative content from PDF...")
    narrative_content, narrative_links = extract_narrative_content(sections_lookup)
    print(f"  Found narrative content in {len(narrative_content)} sections")
    print(f"  Linked narratives to {len(narrative_links)} tables")

    descriptions = load_descriptions()

    sections: list[dict] = []

    for dir_path in sorted(OPERATING_OUTPUT_DIR.iterdir()):
        if not dir_path.is_dir():
            continue

        match = DIR_PATTERN.match(dir_path.name)
        if not match:
            continue

        section_num = int(match.group(1))
        section_name = match.group(2).replace("_", " ")

        # Get section info from sections JSON
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

            table_id = f"s{section_num}_p{rel_page}_t{table_idx}"
            table: dict = {
                "id": table_id,
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

            # Attach linked narrative text
            link_key = (section_num, rel_page, table_idx)
            if link_key in narrative_links:
                linked = narrative_links[link_key]
                table["linked_narrative"] = " ".join(
                    b["text"].replace("\n", " ") for b in linked
                )

            # Attach pre-generated description
            if table_id in descriptions:
                table["description"] = descriptions[table_id]

            tables.append(table)

        slug = slugify(title)
        section_dict: dict = {
            "section_number": section_num,
            "title": title,
            "slug": slug,
            "start_page": start_page,
            "end_page": section_info.get("end_page"),
            "tables": tables,
        }
        if section_num in narrative_content:
            section_dict["page_content"] = narrative_content[section_num]
        sections.append(section_dict)

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

    # Skip overview sections (1-9) — they contain citywide summaries, not departments
    for section in sections:
        if section["section_number"] <= 9:
            continue
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
            entry: dict = {
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
            }
            if "description" in table:
                entry["description"] = table["description"]
            items.append(entry)

    return items


def build_search_index(sections: list[dict]) -> list[dict]:
    """Build a lightweight search index — section titles, table headers, and narrative snippets."""
    items: list[dict] = []

    for section in sections:
        # Collect narrative text for section-level search
        narrative_snippets: list[str] = []
        for page in section.get("page_content", []):
            for block in page.get("text_blocks", []):
                if block["role"] in ("narrative", "leading_prose", "trailing_prose"):
                    # Take first 200 chars of each block for search
                    narrative_snippets.append(block["text"][:200])

        # Section-level entry with narrative text for searching
        items.append({
            "sectionTitle": section["title"],
            "slug": section["slug"],
            "tableId": "",
            "tableType": "",
            "headers": "",
            "narrative": " ".join(narrative_snippets)[:500],
            "page": 0,
            "tableIndex": -1,
        })

        for table in section["tables"]:
            # Use linked narrative or description for searchability
            table_narrative = table.get("linked_narrative", "")
            if not table_narrative:
                table_narrative = table.get("description", "")
            items.append({
                "sectionTitle": section["title"],
                "slug": section["slug"],
                "tableId": table["id"],
                "tableType": table["table_type"],
                "headers": " ".join(table["headers"]),
                "narrative": table_narrative[:500],
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
            })

    return items


def load_capital_sections() -> dict[int, dict]:
    """Load sections-capital.json and index by 1-based position."""
    sections_path = INPUT_DIR / "sections-capital.json"
    if not sections_path.exists():
        return {}
    with open(sections_path, encoding="utf-8") as f:
        sections = json.load(f)
    result: dict[int, dict] = {}
    for i, section in enumerate(sections, start=1):
        result[i] = section
    return result


def classify_capital_table(headers: list[str]) -> str:
    """Classify a capital budget table by its header pattern."""
    header_text = " ".join(headers).lower()
    if "source" in header_text and "2026" in header_text:
        return "cip_funding"
    if "deliverable" in header_text or "objective" in header_text:
        return "deliverables"
    return "unknown"


def build_capital_data() -> dict:
    """Build the capital budget data bundle."""
    sections_lookup = load_capital_sections()
    if not sections_lookup:
        return {"sections": []}

    sections: list[dict] = []

    if not CAPITAL_OUTPUT_DIR.exists():
        return {"sections": []}

    for dir_path in sorted(CAPITAL_OUTPUT_DIR.iterdir()):
        if not dir_path.is_dir():
            continue

        match = DIR_PATTERN.match(dir_path.name)
        if not match:
            continue

        section_num = int(match.group(1))
        section_name = match.group(2).replace("_", " ")

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
            table_type = classify_capital_table(parsed["headers"])

            table: dict = {
                "id": f"cap_s{section_num}_p{rel_page}_t{table_idx}",
                "relative_page": rel_page,
                "table_index": table_idx,
                "table_type": table_type,
                "headers": parsed["headers"],
                "rows": parsed["rows"],
            }
            if start_page is not None:
                table["absolute_page"] = start_page + rel_page

            tables.append(table)

        slug = slugify(title)
        section_dict: dict = {
            "section_number": section_num,
            "title": title,
            "slug": slug,
            "start_page": start_page,
            "end_page": section_info.get("end_page"),
            "tables": tables,
        }
        # Include capital-specific metadata
        if "functional_area" in section_info:
            section_dict["functional_area"] = section_info["functional_area"]
        if "department" in section_info:
            section_dict["department"] = section_info["department"]
        if "project_type" in section_info:
            section_dict["project_type"] = section_info["project_type"]
        if "project_manager" in section_info:
            section_dict["project_manager"] = section_info["project_manager"]

        sections.append(section_dict)

    return {"sections": sections}


def build_capital_projects(sections: list[dict]) -> list[dict]:
    """Build a summary view of all capital projects with funding totals."""
    projects: list[dict] = []

    for section in sections:
        project: dict = {
            "title": section["title"],
            "slug": section["slug"],
            "functionalArea": section.get("functional_area", ""),
            "department": section.get("department", ""),
            "projectType": section.get("project_type", ""),
        }

        # Extract funding from CIP table
        for table in section["tables"]:
            if table["table_type"] == "cip_funding":
                # Find TOTAL row
                for row in table["rows"]:
                    if row and row[0].strip().upper() == "TOTAL":
                        headers = table["headers"]
                        funding: dict[str, float | None] = {}
                        for i, h in enumerate(headers[1:], start=1):
                            if i < len(row):
                                funding[h.strip()] = parse_currency(row[i])
                        project["funding"] = funding
                        break

            elif table["table_type"] == "deliverables":
                deliverables: list[dict] = []
                headers = table["headers"]
                for row in table["rows"]:
                    d: dict = {}
                    for i, h in enumerate(headers):
                        if i < len(row):
                            d[h.strip()] = row[i]
                    deliverables.append(d)
                project["deliverables"] = deliverables

        projects.append(project)

    return projects


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

    # Capital budget data
    capital_data = build_capital_data()
    capital_sections = capital_data["sections"]

    if capital_sections:
        out_path = WEB_DATA_DIR / "capital-budget-data.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(capital_data, f, indent=2)
        print(f"Wrote {out_path} ({len(capital_sections)} sections)")

        capital_projects = build_capital_projects(capital_sections)
        with open(views_dir / "capital-projects.json", "w", encoding="utf-8") as f:
            json.dump(capital_projects, f, indent=2)
        print(f"Wrote capital-projects.json ({len(capital_projects)} projects)")

        # Add capital sections to search index with budgetType tag
        for item in search_index:
            item["budgetType"] = "operating"
        for section in capital_sections:
            search_index.append({
                "sectionTitle": section["title"],
                "slug": section["slug"],
                "tableId": "",
                "tableType": "",
                "headers": "",
                "narrative": "",
                "page": 0,
                "tableIndex": -1,
                "budgetType": "capital",
            })
            for table in section["tables"]:
                search_index.append({
                    "sectionTitle": section["title"],
                    "slug": section["slug"],
                    "tableId": table["id"],
                    "tableType": table["table_type"],
                    "headers": " ".join(table["headers"]),
                    "narrative": "",
                    "page": table["relative_page"],
                    "tableIndex": table["table_index"],
                    "budgetType": "capital",
                })
    else:
        print("No capital budget data found, skipping capital output")

    with open(views_dir / "search-index.json", "w", encoding="utf-8") as f:
        json.dump(search_index, f, indent=2)
    print(f"Wrote search-index.json ({len(search_index)} items)")


if __name__ == "__main__":
    main()
