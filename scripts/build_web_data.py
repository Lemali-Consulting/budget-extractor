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

from utils.paths import (
    DEFAULT_YEAR,
    expected_dir,
    glossary_path,
    input_dir,
    pdf_path,
    sections_path,
    split_pdf_dir,
    web_data_dir,
)

# Budget year — set from CLI or default. PRIOR_YEAR is always BUDGET_YEAR - 1.
BUDGET_YEAR: int = DEFAULT_YEAR
PRIOR_YEAR: int = BUDGET_YEAR - 1

# Derived paths (re-initialized in main() if --year is passed)
INPUT_DIR = input_dir(BUDGET_YEAR)
OPERATING_OUTPUT_DIR = expected_dir(BUDGET_YEAR, "operating")
CAPITAL_OUTPUT_DIR = expected_dir(BUDGET_YEAR, "capital")
GLOSSARY_PATH = glossary_path()
PDF_PATH = pdf_path(BUDGET_YEAR, "operating")
CAPITAL_SPLIT_DIR = split_pdf_dir(BUDGET_YEAR, "capital")
WEB_DATA_DIR = web_data_dir()

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

    # Fix header/data column mismatch: if the header row has more columns than
    # the coord row (column metadata), strip empty header columns to realign.
    # The extractor sometimes produces headers with extra empty columns that
    # don't correspond to data columns.
    num_data_cols = len(coord_row)
    if len(headers) > num_data_cols:
        # Remove empty columns from the header to match data column count
        non_empty_indices = [i for i, h in enumerate(headers) if h.strip()]
        empty_indices = [i for i, h in enumerate(headers) if not h.strip()]
        extra = len(headers) - num_data_cols
        if len(empty_indices) >= extra:
            # Remove the first N empty columns
            to_remove = set(empty_indices[:extra])
            headers = [h for i, h in enumerate(headers) if i not in to_remove]

    return {"headers": headers, "rows": data_rows, "sections": sections}


def classify_table(headers: list[str], section_title: str = "") -> str:
    """Classify a table by its header pattern and section context."""
    header_text = " ".join(headers).lower()
    title_lower = section_title.lower()
    if "fte" in header_text and ("rate" in header_text or "grade" in header_text):
        return "personnel"
    if ("total full time" in header_text or "total full-time" in header_text
            or ("part-time" in header_text and "allowance" in header_text)):
        return "personnel"
    # Personnel rows with grade codes like "32G"
    if any(h.strip() and len(h.strip()) <= 4 and h.strip()[-1].isalpha()
           and h.strip()[:-1].isdigit() for h in headers):
        return "personnel"
    if "revenue" in header_text:
        return "revenue"
    if "budget" in header_text and "actual" in header_text:
        return "financial_summary"
    if "budget" in header_text:
        return "financial"
    # Grant tables
    if "grant" in header_text and ("funder" in header_text or "amount awarded" in header_text):
        return "grant"
    if "department" in header_text and "project and funder" in header_text:
        return "grant"
    # Debt service tables
    if "principal" in header_text and ("interest" in header_text or "debt service" in header_text):
        return "debt_service"
    if "debt service" in title_lower:
        return "debt_service"
    # Forecast tables (year-only columns like ['', '2026', '2027', ...])
    year_count = sum(1 for h in headers if h.strip() and len(h.strip()) == 4 and h.strip().startswith("20"))
    if year_count >= 3:
        return "forecast"
    if "account" in header_text and year_count >= 2:
        return "forecast"
    # Trust fund balance tables
    if "projected" in header_text and ("balance" in header_text or "beginning" in header_text
                                       or "ending" in header_text):
        return "fund_balance"
    # Allocation tables
    if "allocation" in header_text:
        return "allocation"
    # Salary / rate tables
    if "grade" in header_text and "step" in header_text:
        return "salary"
    if "hourly rate" in header_text or "annual rate" in header_text:
        return "salary"
    if "salary" in title_lower and ("grade" in header_text or "step" in header_text):
        return "salary"
    if "firefighter" in header_text or "hourly rates" in header_text:
        return "salary"
    # Fee schedule tables
    if "fee" in title_lower and "schedule" in title_lower:
        return "fee_schedule"
    if "fee description" in header_text:
        return "fee_schedule"
    # Deliverables / objectives
    if "deliverable" in header_text or "objective" in header_text:
        return "deliverables"
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


def generate_table_label(table: dict, section_title: str) -> str:
    """Generate a short human-readable label for a table from its description or metadata."""
    desc: str = table.get("description", "")

    if desc:
        # Extract fund/entity name from common description patterns
        # "Financial snapshot for X showing..." → X
        m = re.match(r"Financial snapshot for (.+?) showing", desc)
        if m:
            return m.group(1)

        # "Personnel roster for X listing N positions..." → first section group or "N positions"
        m = re.match(r"Personnel roster for .+? listing (\d+) (?:staff )?positions?", desc)
        if m:
            sections = table.get("sections", [])
            unique_sections = list(dict.fromkeys(s for s in sections if s))
            if unique_sections:
                if len(unique_sections) <= 2:
                    return ", ".join(unique_sections)
                return f"{unique_sections[0]} + {len(unique_sections) - 1} more"
            return f"{m.group(1)} positions"

        # "Financial summary for X comparing ..., covering Y, Z" → extract topics
        if desc.startswith("Financial summary"):
            m2 = re.search(r"covering (.+?)\.?$", desc)
            if m2:
                topics = m2.group(1)
                # Extract first major category after "Expenditures, "
                parts = [p.strip() for p in topics.split(",")]
                # Skip generic "Expenditures" lead-in, show first specific category
                specific = [p for p in parts if p not in ("Expenditures", "Revenues")]
                if specific:
                    if len(specific) <= 2:
                        return ", ".join(specific)
                    return f"{specific[0]} + {len(specific) - 1} more"
            return "Financial Summary"

        # "Five-year budget projection for X..." → "5-Year Projection"
        if desc.startswith("Five-year budget projection"):
            return "5-Year Projection"

        # "Five-year revenue and expenditure forecast..." → "5-Year Forecast"
        if desc.startswith("Five-year") and "forecast" in desc:
            return "5-Year Forecast"

        # "Five-year departmental expenditure forecast..." → "Departmental Forecast"
        if "departmental expenditure forecast" in desc:
            return "Departmental Forecast"

        # "Budget detail for X comparing..." → X
        m = re.match(r"Budget detail for (.+?) comparing", desc)
        if m:
            return m.group(1)

        # "Revenue accounts for X covering Y" → Y (topics)
        m = re.match(r"(?:Revenue|Expenditure) accounts? for .+? (?:covering|broken down by) (.+?)\.?$", desc)
        if m:
            topics = m.group(1)
            # Truncate if too long
            if len(topics) > 50:
                parts = [p.strip() for p in topics.split(",")]
                return ", ".join(parts[:2]) + f" + {len(parts) - 2} more"
            return topics

        # "Account-level detail for X covering Y" → Y
        m = re.match(r"Account-level detail for .+? covering (.+?)\.?$", desc)
        if m:
            topics = m.group(1)
            if len(topics) > 50:
                parts = [p.strip() for p in topics.split(",")]
                return ", ".join(parts[:2]) + f" + {len(parts) - 2} more"
            return topics

        # "Grant inventory listing N grants..." → "Grant Inventory"
        if desc.startswith("Grant inventory"):
            return "Grant Inventory"

        # "Projected beginning balance for X" → "Beginning Balance"
        if "Projected beginning balance" in desc:
            return "Beginning Balance"

        # "Budget data for X (years) with N line items" → first header or "N line items"
        m = re.match(r"Budget data for .+? \(.+?\) with (\d+) line items", desc)
        if m:
            h0 = table.get("headers", [""])[0]
            if h0 and h0 not in ("", "Account", "Subclass", "Title"):
                return h0[:50]
            return f"{m.group(1)} line items"

    # Fallback: use first header if it's descriptive
    headers = table.get("headers", [])
    if headers and headers[0] and headers[0] not in ("", "Account", "Subclass", "Title"):
        h0 = headers[0]
        if len(h0) <= 50:
            return h0

    # Fallback: prettify the type
    table_type: str = table.get("table_type", "unknown")
    label = table_type.replace("_", " ").title()
    return label


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
            table_type = classify_table(parsed["headers"], section_title=title)

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


def _format_dollar(amount: float) -> str:
    """Format a dollar amount for display (e.g. '$4.1M' or '$850K')."""
    if abs(amount) >= 1_000_000:
        return f"${amount / 1_000_000:,.1f}M"
    if abs(amount) >= 1_000:
        return f"${amount / 1_000:,.0f}K"
    return f"${amount:,.0f}"


def build_section_highlights(section: dict) -> list[str]:
    """Generate plain-language highlight strings for a section."""
    highlights: list[str] = []
    tables = section.get("tables", [])

    # --- Budget change highlight ---
    for table in tables:
        if table.get("table_type") not in ("financial_summary", "financial"):
            continue
        headers = table.get("headers", [])
        col_current = -1
        col_prior = -1
        for i, h in enumerate(headers):
            if str(BUDGET_YEAR) in h and "Budget" in h:
                col_current = i
            elif str(PRIOR_YEAR) in h and "Budget" in h:
                col_prior = i
        if col_current < 0 or col_prior < 0:
            continue

        # Find total row and line-item changes
        total_current: float | None = None
        total_prior: float | None = None
        line_changes: list[tuple[str, float]] = []

        for row in table.get("rows", []):
            label = (row[0] if row else "").strip()
            if not label:
                continue
            val_current = parse_currency(row[col_current] if col_current < len(row) else "")
            val_prior = parse_currency(row[col_prior] if col_prior < len(row) else "")

            label_lower = label.lower()
            if label_lower in ("expenditures total", "total expenditures", "total"):
                total_current = val_current
                total_prior = val_prior
            elif val_current is not None and val_prior is not None and "total" not in label_lower:
                change = val_current - val_prior
                if abs(change) > 0:
                    line_changes.append((label, change))

        if total_current is not None and total_prior is not None and total_prior > 0:
            dollar_change = total_current - total_prior
            pct_change = (dollar_change / total_prior) * 100
            direction = "increases" if dollar_change > 0 else "decreases"
            msg = f"Budget {direction} {abs(pct_change):.1f}% ({_format_dollar(abs(dollar_change))})"

            # Find top driver
            line_changes.sort(key=lambda x: abs(x[1]), reverse=True)
            if line_changes and abs(line_changes[0][1]) > abs(dollar_change) * 0.2:
                driver_label, driver_change = line_changes[0]
                # Clean subclass codes like "51 - PERSONNEL-SALARIES & WAGES" -> "Personnel - Salaries & Wages"
                driver_label = re.sub(r"^\d+\s*-\s*", "", driver_label).title()
                driver_dir = "more" if driver_change > 0 else "less"
                msg += f", led by {_format_dollar(abs(driver_change))} {driver_dir} in {driver_label}"
            highlights.append(msg)
            break

    # --- FTE change highlight ---
    for table in tables:
        if table.get("table_type") != "personnel":
            continue
        headers = table.get("headers", [])
        headers_lower = [h.lower() for h in headers]
        fte_current_idx = next((i for i, h in enumerate(headers_lower) if str(BUDGET_YEAR) in h and "fte" in h), -1)
        fte_prior_idx = next((i for i, h in enumerate(headers_lower) if str(PRIOR_YEAR) in h and "fte" in h), -1)
        if fte_current_idx < 0 or fte_prior_idx < 0:
            continue

        for row in table.get("rows", []):
            label = (row[0] if row else "").strip().lower()
            if label == "total full-time permanent positions":
                fte_current = parse_currency(row[fte_current_idx] if fte_current_idx < len(row) else "")
                fte_prior = parse_currency(row[fte_prior_idx] if fte_prior_idx < len(row) else "")
                if fte_current is not None and fte_prior is not None:
                    diff = int(fte_current - fte_prior)
                    if diff > 0:
                        highlights.append(f"Adds {diff} position{'s' if diff != 1 else ''} ({int(fte_prior)} \u2192 {int(fte_current)} FTE)")
                    elif diff < 0:
                        highlights.append(f"Reduces by {abs(diff)} position{'s' if abs(diff) != 1 else ''} ({int(fte_prior)} \u2192 {int(fte_current)} FTE)")
                    else:
                        highlights.append(f"Staffing unchanged at {int(fte_current)} FTE")
                break
        break

    return highlights


def build_budget_changes(sections: list[dict], personnel: list[dict]) -> dict:
    """Build a summary of the biggest changes across the whole budget."""
    dept_changes: list[dict] = []

    for section in sections:
        if section["section_number"] <= 9:
            continue

        budget_prior: float | None = None
        budget_current: float | None = None
        fte_prior: float | None = None
        fte_current: float | None = None

        for table in section["tables"]:
            headers = table.get("headers", [])
            if table["table_type"] in ("financial_summary", "financial"):
                col_current = next((i for i, h in enumerate(headers) if str(BUDGET_YEAR) in h and "Budget" in h), -1)
                col_prior = next((i for i, h in enumerate(headers) if str(PRIOR_YEAR) in h and "Budget" in h), -1)
                if col_current >= 0 and col_prior >= 0:
                    for row in table["rows"]:
                        label = (row[0] if row else "").strip().lower()
                        if label in ("expenditures total", "total expenditures", "total"):
                            budget_current = parse_currency(row[col_current] if col_current < len(row) else "")
                            budget_prior = parse_currency(row[col_prior] if col_prior < len(row) else "")
                            break

            if table["table_type"] == "personnel":
                headers_lower = [h.lower() for h in headers]
                fi_current = next((i for i, h in enumerate(headers_lower) if str(BUDGET_YEAR) in h and "fte" in h), -1)
                fi_prior = next((i for i, h in enumerate(headers_lower) if str(PRIOR_YEAR) in h and "fte" in h), -1)
                if fi_current >= 0 and fi_prior >= 0:
                    for row in table["rows"]:
                        if (row[0] if row else "").strip().lower() == "total full-time permanent positions":
                            fte_current = parse_currency(row[fi_current] if fi_current < len(row) else "")
                            fte_prior = parse_currency(row[fi_prior] if fi_prior < len(row) else "")
                            break

        if budget_prior and budget_current and budget_prior > 0:
            dollar_change = budget_current - budget_prior
            pct_change = (dollar_change / budget_prior) * 100
            entry: dict = {
                "department": section["title"],
                "slug": section["slug"],
                f"budget{PRIOR_YEAR}": budget_prior,
                f"budget{BUDGET_YEAR}": budget_current,
                "dollarChange": dollar_change,
                "pctChange": round(pct_change, 1),
            }
            if fte_prior is not None:
                entry[f"fte{PRIOR_YEAR}"] = fte_prior
            if fte_current is not None:
                entry[f"fte{BUDGET_YEAR}"] = fte_current
            dept_changes.append(entry)

    dept_changes.sort(key=lambda x: x["dollarChange"], reverse=True)

    # New and eliminated positions
    new_positions: list[dict] = []
    eliminated_positions: list[dict] = []
    for p in personnel:
        fte_prior_val = p.get(f"fte{PRIOR_YEAR}") or 0
        fte_current_val = p.get(f"fte{BUDGET_YEAR}") or 0
        if fte_current_val > 0 and fte_prior_val == 0:
            new_positions.append({
                "department": p["department"],
                "title": p["title"],
                "fte": fte_current_val,
                "budget": p.get(f"budget{BUDGET_YEAR}") or 0,
            })
        elif fte_prior_val > 0 and fte_current_val == 0:
            eliminated_positions.append({
                "department": p["department"],
                "title": p["title"],
                "fte": fte_prior_val,
                "budget": p.get(f"budget{PRIOR_YEAR}") or 0,
            })

    # Compute totals
    total_prior = sum(d[f"budget{PRIOR_YEAR}"] for d in dept_changes)
    total_current = sum(d[f"budget{BUDGET_YEAR}"] for d in dept_changes)
    total_fte_prior = sum(d.get(f"fte{PRIOR_YEAR}", 0) or 0 for d in dept_changes)
    total_fte_current = sum(d.get(f"fte{BUDGET_YEAR}", 0) or 0 for d in dept_changes)

    return {
        f"totalBudget{PRIOR_YEAR}": total_prior,
        f"totalBudget{BUDGET_YEAR}": total_current,
        f"totalFte{PRIOR_YEAR}": total_fte_prior,
        f"totalFte{BUDGET_YEAR}": total_fte_current,
        "departmentChanges": dept_changes,
        "topIncreases": [d for d in dept_changes if d["dollarChange"] > 0][:10],
        "topDecreases": list(reversed([d for d in dept_changes if d["dollarChange"] < 0]))[:10],
        "newPositions": new_positions,
        "eliminatedPositions": eliminated_positions,
    }


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

            # Find a "total" row — prefer "Expenditures Total" over generic totals,
            # and skip total rows where all budget values are zero/dash
            best_total: list | None = None
            for row in table["rows"]:
                label = (row[0] if row else "").lower()
                if "total" not in label or "subtotal" in label:
                    continue
                # Check if this row has any parseable budget amounts
                has_amount = any(
                    parse_currency(row[col["idx"]] if col["idx"] < len(row) else "") is not None
                    for col in budget_cols
                )
                if not has_amount:
                    continue
                if "expenditures total" in label or "total expenditures" in label:
                    best_total = row
                    break  # This is the best match, stop looking
                if best_total is None:
                    best_total = row
            if best_total:
                for col in budget_cols:
                    amount = parse_currency(best_total[col["idx"]] if col["idx"] < len(best_total) else "")
                    if amount and amount > 0:
                        rows.append({
                            "department": section["title"],
                            "slug": section["slug"],
                            "year": col["year"],
                            "amount": amount,
                        })

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
            fte_prior_idx = next((i for i, h in enumerate(headers) if str(PRIOR_YEAR) in h and "fte" in h), -1)
            fte_current_idx = next((i for i, h in enumerate(headers) if str(BUDGET_YEAR) in h and "fte" in h), -1)
            budget_prior_idx = next((i for i, h in enumerate(headers) if str(PRIOR_YEAR) in h and "budget" in h), -1)
            budget_current_idx = next((i for i, h in enumerate(headers) if str(BUDGET_YEAR) in h and "budget" in h), -1)
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
                    f"fte{PRIOR_YEAR}": parse_currency(cell(fte_prior_idx)),
                    f"fte{BUDGET_YEAR}": parse_currency(cell(fte_current_idx)),
                    f"budget{PRIOR_YEAR}": parse_currency(cell(budget_prior_idx)),
                    f"budget{BUDGET_YEAR}": parse_currency(cell(budget_current_idx)),
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


def _deduplicate_labels(items: list[dict]) -> None:
    """Append numbering to duplicate labels within the same section."""
    from collections import Counter

    # Group items by section
    section_items: dict[int, list[dict]] = {}
    for item in items:
        section_items.setdefault(item["sectionNumber"], []).append(item)

    for section_tables in section_items.values():
        label_counts = Counter(t["label"] for t in section_tables)
        # For labels that appear more than once, append a counter
        label_seen: dict[str, int] = {}
        for t in section_tables:
            if label_counts[t["label"]] > 1:
                label_seen.setdefault(t["label"], 0)
                label_seen[t["label"]] += 1
                t["label"] = f"{t['label']} ({label_seen[t['label']]})"


def build_tables_index(sections: list[dict], budget_type: str = "operating") -> list[dict]:
    """Build lightweight metadata index for all tables (no row data)."""
    items: list[dict] = []

    for section in sections:
        for table in section["tables"]:
            numeric_cols = detect_numeric_columns(table["headers"], table["rows"])
            label = generate_table_label(table, section["title"])
            entry: dict = {
                "id": table["id"],
                "sectionNumber": section["section_number"],
                "sectionTitle": section["title"],
                "sectionSlug": section["slug"],
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
                "type": table["table_type"],
                "label": label,
                "headers": table["headers"],
                "rowCount": len(table["rows"]),
                "numericCols": numeric_cols,
                "budgetType": budget_type,
            }
            if "description" in table:
                entry["description"] = table["description"]
            items.append(entry)

    _deduplicate_labels(items)
    return items


def _extract_section_narrative(section: dict) -> str:
    """Extract narrative text from a section's page_content text_blocks."""
    snippets: list[str] = []
    for page in section.get("page_content", []):
        for block in page.get("text_blocks", []):
            if block["role"] in ("narrative", "leading_prose", "trailing_prose"):
                snippets.append(block["text"][:200])
    return " ".join(snippets)[:500]


def _extract_line_items(table: dict) -> str:
    """Extract first-column values from table rows as searchable line items."""
    items: list[str] = []
    for row in table.get("rows", []):
        if row and row[0].strip():
            label = row[0].strip()
            # Skip totals and blank-ish rows
            if label.upper() not in ("TOTAL", "TOTAL:", "GRAND TOTAL", "GRAND TOTAL:"):
                items.append(label)
    return " | ".join(items)[:500]


def build_search_index(sections: list[dict]) -> list[dict]:
    """Build a lightweight search index — section titles, table headers, narrative, and line items."""
    items: list[dict] = []

    for section in sections:
        narrative = _extract_section_narrative(section)

        # Section-level entry with narrative text for searching
        items.append({
            "sectionTitle": section["title"],
            "slug": section["slug"],
            "tableId": "",
            "tableType": "",
            "headers": "",
            "narrative": narrative,
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
        })

        for table in section["tables"]:
            # Use linked narrative or description for searchability
            table_narrative = table.get("linked_narrative", "")
            if not table_narrative:
                table_narrative = table.get("description", "")
            label = generate_table_label(table, section["title"])
            items.append({
                "sectionTitle": section["title"],
                "slug": section["slug"],
                "tableId": table["id"],
                "tableType": table["table_type"],
                "label": label,
                "headers": " ".join(table["headers"]),
                "narrative": table_narrative[:500],
                "lineItems": _extract_line_items(table),
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
            })

    return items


def build_capital_search_items(capital_sections: list[dict]) -> list[dict]:
    """Build search index entries for capital budget sections, including narrative."""
    items: list[dict] = []

    for section in capital_sections:
        narrative = _extract_section_narrative(section)

        items.append({
            "sectionTitle": section["title"],
            "slug": section["slug"],
            "tableId": "",
            "tableType": "",
            "headers": "",
            "narrative": narrative,
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "capital",
        })

        for table in section["tables"]:
            items.append({
                "sectionTitle": section["title"],
                "slug": section["slug"],
                "tableId": table["id"],
                "tableType": table["table_type"],
                "headers": " ".join(table["headers"]),
                "narrative": "",
                "lineItems": _extract_line_items(table),
                "page": table["relative_page"],
                "tableIndex": table["table_index"],
                "budgetType": "capital",
            })

    return items


def build_glossary_search_items(glossary: dict) -> list[dict]:
    """Build search index entries for glossary terms."""
    items: list[dict] = []

    # Abbreviations
    for abbr, meaning in sorted(glossary.get("abbreviations", {}).items()):
        items.append({
            "sectionTitle": f"{abbr} — {meaning}",
            "slug": "",
            "tableId": "",
            "tableType": "glossary",
            "headers": "",
            "narrative": meaning,
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "glossary",
            "href": "/glossary/#abbreviations",
        })

    # General terms and fiscal metrics
    for key in ("general_terms", "fiscal_metrics"):
        section_id = key
        for entry in glossary.get(key, []):
            items.append({
                "sectionTitle": entry["term"],
                "slug": "",
                "tableId": "",
                "tableType": "glossary",
                "headers": "",
                "narrative": entry.get("description", "")[:500],
                "lineItems": "",
                "page": 0,
                "tableIndex": -1,
                "budgetType": "glossary",
                "href": f"/glossary/#{section_id}",
            })

    # Capital funding sources
    for src in glossary.get("capital_funding_sources", []):
        items.append({
            "sectionTitle": src["source"],
            "slug": "",
            "tableId": "",
            "tableType": "glossary",
            "headers": "",
            "narrative": src.get("description", "")[:500],
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "glossary",
            "href": "/glossary/#capital_funding_sources",
        })

    # Funds
    for fund in glossary.get("funds", []):
        items.append({
            "sectionTitle": fund["name"],
            "slug": "",
            "tableId": "",
            "tableType": "glossary",
            "headers": "",
            "narrative": fund.get("description", "")[:500],
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "glossary",
            "href": "/glossary/#funds",
        })

    # Revenue/expenditure line items
    for key in ("revenue_line_items", "expenditure_line_items"):
        section_id = key
        for entry in glossary.get(key, []):
            items.append({
                "sectionTitle": entry["term"],
                "slug": "",
                "tableId": "",
                "tableType": "glossary",
                "headers": "",
                "narrative": entry.get("description", "")[:500],
                "lineItems": "",
                "page": 0,
                "tableIndex": -1,
                "budgetType": "glossary",
                "href": f"/glossary/#{section_id}",
            })

    return items


def build_changes_search_items(budget_changes: dict) -> list[dict]:
    """Build search index entries for budget changes (new/eliminated positions, top changes)."""
    items: list[dict] = []

    # Department changes
    for dept in budget_changes.get("departmentChanges", []):
        change_desc = f"{PRIOR_YEAR}: ${dept[f'budget{PRIOR_YEAR}']:,.0f} → {BUDGET_YEAR}: ${dept[f'budget{BUDGET_YEAR}']:,.0f} ({dept['pctChange']}%)"
        items.append({
            "sectionTitle": dept["department"],
            "slug": dept.get("slug", ""),
            "tableId": "",
            "tableType": "budget_change",
            "headers": "",
            "narrative": change_desc,
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "changes",
            "href": "/changes/",
        })

    # New positions
    for pos in budget_changes.get("newPositions", []):
        items.append({
            "sectionTitle": f"{pos['title']} (New Position)",
            "slug": "",
            "tableId": "",
            "tableType": "new_position",
            "headers": "",
            "narrative": f"{pos['department']} — {pos['fte']} FTE, ${pos.get('budget', 0):,.0f}",
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "changes",
            "href": "/changes/",
        })

    # Eliminated positions
    for pos in budget_changes.get("eliminatedPositions", []):
        items.append({
            "sectionTitle": f"{pos['title']} (Eliminated)",
            "slug": "",
            "tableId": "",
            "tableType": "eliminated_position",
            "headers": "",
            "narrative": f"{pos['department']} — {pos['fte']} FTE",
            "lineItems": "",
            "page": 0,
            "tableIndex": -1,
            "budgetType": "changes",
            "href": "/changes/",
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


def classify_capital_table(headers: list[str], section_title: str = "") -> str:
    """Classify a capital budget table by its header pattern and section context."""
    header_text = " ".join(headers).lower()
    if "source" in header_text and str(BUDGET_YEAR) in header_text:
        return "cip_funding"
    if "deliverable" in header_text or "objective" in header_text:
        return "deliverables"
    # Functional area summary tables from the introduction
    if "functional area" in header_text or f"{BUDGET_YEAR} total" in header_text:
        return "capital_summary"
    if "total:" in header_text:
        return "capital_summary"
    # CPFC scoring tables
    if "cpfc" in header_text and "scoring" in header_text:
        return "capital_summary"
    # Glossary / acronym tables
    if "acronym" in header_text or "term" in header_text:
        return "glossary"
    # Capital project detail tables (project code pattern like "1234 -")
    first_header = (headers[0] if headers else "").strip()
    import re
    if re.match(r"\d{4}\s*-\s*", first_header):
        return "capital_project"
    # Multi-year funding overview (year rows like '2025', '$...')
    if re.match(r"^20\d{2}$", first_header):
        return "capital_summary"
    # Appendices context
    title_lower = section_title.lower()
    if "appendic" in title_lower or "introduction" in title_lower:
        return "capital_summary"
    return "unknown"


def extract_capital_narrative(
    sections_lookup: dict[int, dict],
) -> dict[int, list[dict]]:
    """Extract narrative text blocks from capital budget split PDFs.

    Returns dict mapping section_number -> list of page content dicts with:
      relative_page, text_blocks [{text, role, bbox}]
    """
    if not CAPITAL_SPLIT_DIR.exists():
        print(f"  Skipping capital narrative: {CAPITAL_SPLIT_DIR} not found")
        return {}

    import pdfplumber
    from utils.spatial_table_extractor import SpatialTableExtractor

    ext = SpatialTableExtractor()
    result: dict[int, list[dict]] = {}

    USEFUL_ROLES = {"narrative", "section_title", "leading_prose", "trailing_prose",
                    "mid_table_prose", "footnote"}

    for pdf_path in sorted(CAPITAL_SPLIT_DIR.glob("*.pdf")):
        match = DIR_PATTERN.match(pdf_path.stem)
        if not match:
            continue

        section_num = int(match.group(1))
        pdf = pdfplumber.open(str(pdf_path))
        pages_content: list[dict] = []

        for rel_page, page in enumerate(pdf.pages):
            try:
                tables, content = ext.extract_page_content(page)
            except Exception as e:
                print(f"  Warning: {pdf_path.name} page {rel_page}: {e}")
                continue

            blocks = [
                {"text": b.text, "role": b.role, "bbox": [round(v, 1) for v in b.bbox]}
                for b in content.text_blocks if b.role in USEFUL_ROLES
            ]
            charts = [
                {"bbox": [round(v, 1) for v in c.bbox], "chart_type": c.chart_type}
                for c in content.chart_regions
            ]

            if blocks or charts:
                section_info = sections_lookup.get(section_num, {})
                start_page = section_info.get("start_page", 0)
                pages_content.append({
                    "relative_page": rel_page,
                    "absolute_page": start_page + rel_page if start_page else rel_page,
                    "text_blocks": blocks,
                    "chart_regions": charts,
                })

        pdf.close()
        if pages_content:
            result[section_num] = pages_content

    return result


def build_capital_data() -> dict:
    """Build the capital budget data bundle."""
    sections_lookup = load_capital_sections()
    if not sections_lookup:
        return {"sections": []}

    print("Extracting capital narrative content from split PDFs...")
    narrative_content = extract_capital_narrative(sections_lookup)
    print(f"  Found narrative content in {len(narrative_content)} capital sections")

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
            table_type = classify_capital_table(parsed["headers"], section_title=title)

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

        # Attach narrative content
        if section_num in narrative_content:
            section_dict["page_content"] = narrative_content[section_num]

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


def build_capital_funding_sources(sections: list[dict]) -> list[dict]:
    """Aggregate CIP funding by source across all capital projects."""
    rows: list[dict] = []

    for section in sections:
        for table in section["tables"]:
            if table["table_type"] != "cip_funding":
                continue
            headers = table["headers"]
            for row in table["rows"]:
                source = (row[0] if row else "").strip()
                if not source or source.upper() == "TOTAL":
                    continue
                for i, h in enumerate(headers[1:], start=1):
                    if i < len(row):
                        amount = parse_currency(row[i])
                        year_label = h.strip()
                        if amount and amount != 0 and "Total" not in year_label:
                            rows.append({
                                "project": section["title"],
                                "source": source,
                                "year": year_label,
                                "amount": amount,
                            })

    return rows


def build_personnel_by_department(personnel: list[dict]) -> list[dict]:
    """Aggregate FTE and budget totals per department from personnel rows."""
    dept_map: dict[str, dict] = {}

    for row in personnel:
        dept = row["department"]
        if dept not in dept_map:
            dept_map[dept] = {
                "department": dept,
                "slug": row["slug"],
                f"totalFte{PRIOR_YEAR}": 0.0,
                f"totalFte{BUDGET_YEAR}": 0.0,
                f"totalBudget{PRIOR_YEAR}": 0.0,
                f"totalBudget{BUDGET_YEAR}": 0.0,
                "positionCount": 0,
            }
        d = dept_map[dept]
        d["positionCount"] += 1
        if row[f"fte{PRIOR_YEAR}"] is not None:
            d[f"totalFte{PRIOR_YEAR}"] += row[f"fte{PRIOR_YEAR}"]
        if row[f"fte{BUDGET_YEAR}"] is not None:
            d[f"totalFte{BUDGET_YEAR}"] += row[f"fte{BUDGET_YEAR}"]
        if row[f"budget{PRIOR_YEAR}"] is not None:
            d[f"totalBudget{PRIOR_YEAR}"] += row[f"budget{PRIOR_YEAR}"]
        if row[f"budget{BUDGET_YEAR}"] is not None:
            d[f"totalBudget{BUDGET_YEAR}"] += row[f"budget{BUDGET_YEAR}"]

    return sorted(dept_map.values(), key=lambda d: d[f"totalBudget{BUDGET_YEAR}"], reverse=True)


def build_revenue_waterfall(sections: list[dict]) -> list[dict]:
    """Extract top-level revenue categories with 2026 amounts for waterfall chart."""
    items: list[dict] = []

    for section in sections:
        if section["section_number"] != 7:  # Revenue Detail = section 7
            continue
        for table in section["tables"]:
            headers = table["headers"]
            # Must have Account + 2026 columns
            if not headers or "Account" not in headers[0]:
                continue

            col_current = -1
            for i, h in enumerate(headers):
                if str(BUDGET_YEAR) in h:
                    col_current = i
                    break
            if col_current < 0:
                continue

            sections_col = table.get("sections", [])
            for ri, row in enumerate(table["rows"]):
                label = (row[0] if row else "").strip()
                if not label:
                    continue
                # Top-level categories: row label matches its section label
                # AND starts with a 2-digit code (e.g. "41 - TAX REVENUE")
                section_label = sections_col[ri] if ri < len(sections_col) else ""
                if label == section_label and re.match(r"^\d{2}\s*-\s*", label):
                    amount = parse_currency(row[col_current] if col_current < len(row) else "")
                    if amount and amount > 0:
                        clean = re.sub(r"^\d+\s*-\s*", "", label).title()
                        items.append({"label": clean, "amount": amount, "type": "revenue"})

    return items


def build_department_forecast(sections: list[dict]) -> list[dict]:
    """Extract multi-year budget forecast per department from Five-Year Forecast table."""
    rows: list[dict] = []

    for section in sections:
        if section["section_number"] != 4:  # Five-Year Financial Forecast
            continue
        for table in section["tables"]:
            headers = table["headers"]
            # Find year columns
            year_cols: list[tuple[int, str]] = []
            for i, h in enumerate(headers):
                m = re.search(r"(\d{4})", h)
                if m:
                    year_cols.append((i, m.group(1)))

            if len(year_cols) < 3:
                continue

            for row in table["rows"]:
                label = (row[0] if row else "").strip()
                if not label or "total" in label.lower():
                    continue
                values: list[dict] = []
                for col_idx, year in year_cols:
                    amount = parse_currency(row[col_idx] if col_idx < len(row) else "")
                    if amount is not None:
                        values.append({"year": year, "amount": amount})
                if len(values) >= 3:
                    rows.append({
                        "department": label,
                        "slug": slugify(label),
                        "values": values,
                    })

    return rows


def build_glossary_backlinks(
    operating_sections: list[dict],
    capital_sections: list[dict],
    glossary: dict,
) -> dict[str, list[dict]]:
    """Build a mapping of glossary terms -> sections where they appear.

    Only processes abbreviations and funds. Returns a dict keyed by term
    (abbreviation key or fund name) with values being lists of
    {slug, title, budgetType} dicts.
    """
    # Collect searchable text per section: (slug, title, budgetType) -> combined text
    section_texts: list[tuple[dict, str]] = []

    for section in operating_sections:
        parts: list[str] = [section["title"]]
        for page in section.get("page_content", []):
            for block in page.get("text_blocks", []):
                parts.append(block["text"])
        for table in section["tables"]:
            parts.append(" ".join(table["headers"]))
            if "linked_narrative" in table:
                parts.append(table["linked_narrative"])
            # First column of each row (labels)
            for row in table["rows"]:
                if row:
                    parts.append(row[0])
        meta = {"slug": section["slug"], "title": section["title"], "budgetType": "operating"}
        section_texts.append((meta, " ".join(parts)))

    for section in capital_sections:
        parts = [section["title"]]
        for page in section.get("page_content", []):
            for block in page.get("text_blocks", []):
                parts.append(block["text"])
        for table in section["tables"]:
            parts.append(" ".join(table["headers"]))
            for row in table["rows"]:
                if row:
                    parts.append(row[0])
        meta = {"slug": section["slug"], "title": section["title"], "budgetType": "capital"}
        section_texts.append((meta, " ".join(parts)))

    # Build term patterns
    terms: list[tuple[str, re.Pattern]] = []

    # Abbreviations: match as whole words
    for abbr in glossary.get("abbreviations", {}):
        # Skip very short/common abbreviations that produce noise
        if len(abbr) <= 2:
            continue
        terms.append((abbr, re.compile(r"\b" + re.escape(abbr) + r"\b")))

    # Funds: match by fund name (case-insensitive)
    for fund in glossary.get("funds", []):
        name = fund["name"]
        terms.append((name, re.compile(re.escape(name), re.IGNORECASE)))

    # Capital funding sources: match as whole words
    for src in glossary.get("capital_funding_sources", []):
        source = src["source"]
        terms.append((source, re.compile(r"\b" + re.escape(source) + r"\b")))

    # Scan
    MAX_SECTIONS = 10
    backlinks: dict[str, list[dict] | dict] = {}
    for term_key, pattern in terms:
        matches: list[dict] = []
        for meta, text in section_texts:
            if pattern.search(text):
                matches.append(meta)
        if matches:
            total = len(matches)
            backlinks[term_key] = {
                "sections": matches[:MAX_SECTIONS],
                "total": total,
            }

    return backlinks


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Build web data JSON bundles from extracted CSVs.")
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, help=f"Budget year (default: {DEFAULT_YEAR})")
    parser.add_argument("--output-prefix", type=str, default="", help="Prefix for output filenames (e.g., '2025' → '2025-budget-data.json')")
    args = parser.parse_args()
    prefix = f"{args.output_prefix}-" if args.output_prefix else ""

    # Reinitialize globals for the requested year
    global BUDGET_YEAR, PRIOR_YEAR, INPUT_DIR, OPERATING_OUTPUT_DIR, CAPITAL_OUTPUT_DIR
    global PDF_PATH, CAPITAL_SPLIT_DIR
    BUDGET_YEAR = args.year
    PRIOR_YEAR = BUDGET_YEAR - 1
    INPUT_DIR = input_dir(BUDGET_YEAR)
    OPERATING_OUTPUT_DIR = expected_dir(BUDGET_YEAR, "operating")
    CAPITAL_OUTPUT_DIR = expected_dir(BUDGET_YEAR, "capital")
    PDF_PATH = pdf_path(BUDGET_YEAR, "operating")
    CAPITAL_SPLIT_DIR = split_pdf_dir(BUDGET_YEAR, "capital")

    print(f"Building web data for {BUDGET_YEAR} budget (prior year: {PRIOR_YEAR})")

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    views_dir = WEB_DATA_DIR / "views"
    views_dir.mkdir(parents=True, exist_ok=True)

    data = build_data()
    sections = data["sections"]

    # Generate highlights for each section
    for section in sections:
        hl = build_section_highlights(section)
        if hl:
            section["highlights"] = hl
    highlights_count = sum(1 for s in sections if s.get("highlights"))
    print(f"Generated highlights for {highlights_count} sections")

    # Full data bundle (for Astro build-time rendering of section detail pages)
    out_path = WEB_DATA_DIR / f"{prefix}budget-data.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {out_path} ({len(sections)} sections)")

    # Tables index (lightweight metadata for explorer sidebar) — includes both budgets
    tables_index = build_tables_index(sections, budget_type="operating")

    # Pre-computed views for client-side components
    dept_budgets = build_department_budgets(sections)
    with open(views_dir / f"{prefix}department-budgets.json", "w", encoding="utf-8") as f:
        json.dump(dept_budgets, f, indent=2)
    print(f"Wrote {prefix}department-budgets.json ({len(dept_budgets)} rows)")

    personnel = build_personnel(sections)
    with open(views_dir / f"{prefix}personnel.json", "w", encoding="utf-8") as f:
        json.dump(personnel, f, indent=2)
    print(f"Wrote {prefix}personnel.json ({len(personnel)} rows)")

    # Budget changes view (for "What Changed?" page)
    budget_changes = build_budget_changes(sections, personnel)
    with open(views_dir / f"{prefix}budget-changes.json", "w", encoding="utf-8") as f:
        json.dump(budget_changes, f, indent=2)
    print(f"Wrote {prefix}budget-changes.json ({len(budget_changes['departmentChanges'])} departments, "
          f"{len(budget_changes['newPositions'])} new positions, "
          f"{len(budget_changes['eliminatedPositions'])} eliminated)")

    # Personnel by department (for treemap)
    personnel_by_dept = build_personnel_by_department(personnel)
    with open(views_dir / f"{prefix}personnel-by-department.json", "w", encoding="utf-8") as f:
        json.dump(personnel_by_dept, f, indent=2)
    print(f"Wrote {prefix}personnel-by-department.json ({len(personnel_by_dept)} departments)")

    # Revenue waterfall
    revenue_waterfall = build_revenue_waterfall(sections)
    with open(views_dir / f"{prefix}revenue-waterfall.json", "w", encoding="utf-8") as f:
        json.dump(revenue_waterfall, f, indent=2)
    print(f"Wrote {prefix}revenue-waterfall.json ({len(revenue_waterfall)} categories)")

    # Department forecast (multi-year for sparklines)
    dept_forecast = build_department_forecast(sections)
    with open(views_dir / f"{prefix}department-forecast.json", "w", encoding="utf-8") as f:
        json.dump(dept_forecast, f, indent=2)
    print(f"Wrote {prefix}department-forecast.json ({len(dept_forecast)} departments)")

    search_index = build_search_index(sections)

    # Capital budget data
    capital_data = build_capital_data()
    capital_sections = capital_data["sections"]

    if capital_sections:
        out_path = WEB_DATA_DIR / f"{prefix}capital-budget-data.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(capital_data, f, indent=2)
        print(f"Wrote {out_path} ({len(capital_sections)} sections)")

        capital_projects = build_capital_projects(capital_sections)
        with open(views_dir / f"{prefix}capital-projects.json", "w", encoding="utf-8") as f:
            json.dump(capital_projects, f, indent=2)
        print(f"Wrote {prefix}capital-projects.json ({len(capital_projects)} projects)")

        capital_funding = build_capital_funding_sources(capital_sections)
        with open(views_dir / f"{prefix}capital-funding-sources.json", "w", encoding="utf-8") as f:
            json.dump(capital_funding, f, indent=2)
        print(f"Wrote {prefix}capital-funding-sources.json ({len(capital_funding)} rows)")

        # Add capital tables to the combined tables index
        tables_index.extend(build_tables_index(capital_sections, budget_type="capital"))

        # Add capital sections to search index with budgetType tag and narrative
        for item in search_index:
            item["budgetType"] = "operating"
        search_index.extend(build_capital_search_items(capital_sections))
    else:
        print("No capital budget data found, skipping capital output")

    # Write combined tables index (operating + capital)
    with open(views_dir / f"{prefix}tables-index.json", "w", encoding="utf-8") as f:
        json.dump(tables_index, f, indent=2)
    print(f"Wrote {prefix}tables-index.json ({len(tables_index)} tables)")

    # Add glossary terms to search index
    glossary = data.get("glossary", {})
    glossary_items = build_glossary_search_items(glossary)
    search_index.extend(glossary_items)
    print(f"  Added {len(glossary_items)} glossary terms to search index")

    # Add budget changes to search index
    changes_items = build_changes_search_items(budget_changes)
    search_index.extend(changes_items)
    print(f"  Added {len(changes_items)} budget change items to search index")

    with open(views_dir / f"{prefix}search-index.json", "w", encoding="utf-8") as f:
        json.dump(search_index, f, indent=2)
    print(f"Wrote {prefix}search-index.json ({len(search_index)} items)")

    # Glossary backlinks (abbreviations + funds -> sections where they appear)
    glossary_backlinks = build_glossary_backlinks(
        sections, capital_sections, data.get("glossary", {})
    )
    with open(views_dir / f"{prefix}glossary-backlinks.json", "w", encoding="utf-8") as f:
        json.dump(glossary_backlinks, f, indent=2)
    print(f"Wrote glossary-backlinks.json ({len(glossary_backlinks)} terms with backlinks)")


if __name__ == "__main__":
    main()
