"""Derive section boundaries from the full budget PDF by detecting section title pages."""

import json
from pathlib import Path

import pypdf


# Known section titles in expected order. Each entry is the canonical title
# that will appear in the output JSON. The detector matches against these
# using normalized text from short "divider" pages.
KNOWN_SECTIONS: list[dict[str, str | None]] = [
    {"title": "Budget Authorizing Legislation"},
    {"title": "American Rescue Plan"},
    {"title": "Budget Guide"},
    {"title": "Five-Year Financial Forecast"},
    {"title": "Revenues"},
    {"title": "Revenue Summary"},
    {"title": "Revenue Narrative"},
    {"title": "Revenue Detail"},
    {"title": "Expenditures"},
    {"title": "Expenditure Summary"},
    {"title": "Expenditures Detail"},
    # Departments
    {"title": "City Council"},
    {"title": "Office of the City Clerk"},
    {"title": "Office of the Mayor"},
    {"title": "Office of Management and Budget"},
    {"title": "Department of Innovation and Performance"},
    {"title": "Commission on Human Relations"},
    {"title": "Office of the City Controller"},
    {"title": "Department of Finance"},
    {"title": "Department of Law"},
    {"title": "Ethics Hearing Board"},
    {"title": "Office of Municipal Investigations"},
    {"title": "Department of Human Resources and Civil Service"},
    {"title": "Department of City Planning"},
    {"title": "Department of Permits, Licenses, and Inspections"},
    {"title": "Department of Public Safety"},
    {"title": "Bureau of Administration (Public Safety)"},
    {"title": "Bureau of Emergency Medical Services"},
    {"title": "Bureau of Police"},
    {"title": "Bureau of Fire"},
    {"title": "Bureau of Animal Care and Control"},
    {"title": "Office of Community Health and Safety"},
    {"title": "Department of Public Works"},
    {"title": "Bureau of Administration (Public Works)"},
    {"title": "Bureau of Operations"},
    {"title": "Bureau of Environmental Services"},
    {"title": "Bureau of Facilities"},
    {"title": "Department of Parks and Recreation"},
    {"title": "Department of Mobility and Infrastructure"},
    {"title": "Citizen Police Review Board"},
    # Special funds & other
    {"title": "Special Revenue Funds"},
    {"title": "Grants"},
    {"title": "City of Pittsburgh Organization Chart"},
    {"title": "Salary Tables"},
    {"title": "Debt Service"},
    {"title": "Pension Funding"},
    {"title": "Master Fee Schedule"},
    {"title": "Appendices"},
]


def normalize(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for matching."""
    import re
    text = re.sub(r"[^\w\s]", "", text.lower())
    return " ".join(text.split())


def build_match_variants(title: str) -> list[str]:
    """Build normalized variants of a section title for matching."""
    base = normalize(title)
    variants = [base]
    # Handle parenthetical disambiguation - match without qualifier
    if "(" in title:
        stripped = title[: title.index("(")].strip()
        variants.append(normalize(stripped))
    # Some titles split across lines in the PDF
    # "Five-Year\nFinancial Forecast" -> "fiveyear financial forecast"
    return variants


def is_divider_page(lines: list[str], total_chars: int) -> bool:
    """Check if a page looks like a section divider (short, few lines)."""
    return len(lines) <= 5 and total_chars < 150


def detect_section_start(page_text: str, page_num: int) -> str | None:
    """Try to match a page's text to a known section title."""
    lines = [l.strip() for l in page_text.split("\n") if l.strip()]
    if not lines:
        return None

    total_chars = sum(len(l) for l in lines)

    # For divider pages: join all non-numeric lines as the title
    if is_divider_page(lines, total_chars):
        # Filter out lines that are just the page number
        title_lines = [l for l in lines if not l.strip().isdigit()]
        if not title_lines:
            return None
        page_title = normalize(" ".join(title_lines))

        for section in KNOWN_SECTIONS:
            for variant in build_match_variants(section["title"]):
                if variant == page_title:
                    return section["title"]

        # Special cases for partial matches
        if "city council" in page_title:
            return "City Council"
        # "Revenue" divider (page says "Revenue" not "Revenues")
        if page_title == "revenue":
            return "Revenues"

    # For non-divider pages: check first line for section headers
    first_line = normalize(lines[0])

    if "master fee schedule" in first_line:
        return "Master Fee Schedule"
    if first_line == "revenue summary":
        return "Revenue Summary"
    if first_line == "revenue narrative":
        return "Revenue Narrative"
    if first_line == "2026 salary tables":
        return "Salary Tables"
    if first_line == "expenditures by department":
        return "Expenditure Summary"

    # Revenue Detail starts with "41 - TAX REVENUE" pattern
    if first_line.startswith("41 tax revenue"):
        return "Revenue Detail"

    # Expenditures Detail starts with "51 - PERSONNEL" pattern
    if first_line.startswith("51 personnelsalaries"):
        return "Expenditures Detail"

    return None


def detect_special_fund_starts(reader: pypdf.PdfReader, start_page: int, end_page: int) -> list[dict]:
    """Detect individual special/trust fund boundaries within the Special Revenue Funds section.

    Funds on pages 256-292 each get their own multi-page section (one fund per page range).
    Pages 293+ contain multiple small "summary-only" funds per page, so they are grouped
    into a single "Other Special Revenue Funds" section.
    """
    import re

    fund_sections: list[dict] = []
    current_fund: str | None = None
    summary_start: int | None = None

    for i in range(start_page - 1, end_page):
        text = reader.pages[i].extract_text() or ""
        page_num = i + 1

        # Pages 293+ have multiple funds per page — just track the range
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if lines and "Trust Fund" in lines[0] and page_num >= 293:
            if summary_start is None:
                summary_start = page_num
            continue

        # Pages 256-292: extract fund name from the footer-style line
        # "City of Pittsburgh Operating Budget  <Fund Name>"
        match = re.search(
            r"City of Pittsburgh Operating Budget\s+(.+?Trust Fund)",
            text,
        )
        if match:
            fund_name = re.sub(r"\s+", " ", match.group(1)).strip()
            # Normalize "Parks & Recreation" -> "Parks and Recreation"
            fund_name = fund_name.replace("&", "and")
            if fund_name != current_fund:
                current_fund = fund_name
                fund_sections.append({
                    "title": fund_name,
                    "start_page": page_num,
                })

    # Add the grouped summary funds section at the end
    if summary_start is not None:
        fund_sections.append({
            "title": "Other Special Revenue Funds",
            "start_page": summary_start,
        })

    return fund_sections


def derive_sections(pdf_path: str) -> list[dict]:
    """Scan the PDF and derive section boundaries."""
    reader = pypdf.PdfReader(pdf_path)
    total_pages = len(reader.pages)

    found_sections: list[dict] = []
    seen_titles: set[str] = set()

    # Titles that legitimately appear twice (disambiguated by page context)
    ALLOW_DUPLICATE = {"Bureau of Administration (Public Safety)", "Bureau of Administration (Public Works)"}

    for i in range(total_pages):
        text = reader.pages[i].extract_text() or ""
        page_num = i + 1  # 1-indexed

        match = detect_section_start(text, page_num)
        if match:
            # Disambiguate duplicate "Bureau of Administration" by page context
            if match == "Bureau of Administration (Public Safety)":
                if page_num > 200:
                    match = "Bureau of Administration (Public Works)"

            # Skip duplicate detections of the same section
            if match in seen_titles and match not in ALLOW_DUPLICATE:
                continue
            seen_titles.add(match)

            found_sections.append({
                "title": match,
                "start_page": page_num,
            })

    # Fill in end_page: each section ends at the page before the next one starts
    for i, section in enumerate(found_sections):
        if i + 1 < len(found_sections):
            section["end_page"] = found_sections[i + 1]["start_page"] - 1
        else:
            section["end_page"] = total_pages

    # Expand Special Revenue Funds into individual fund sections
    expanded: list[dict] = []
    for section in found_sections:
        expanded.append(section)
        if section["title"] == "Special Revenue Funds":
            fund_sections = detect_special_fund_starts(
                reader, section["start_page"], section["end_page"]
            )
            if fund_sections:
                # Fill in end_pages for fund sub-sections
                for j, fund in enumerate(fund_sections):
                    if j + 1 < len(fund_sections):
                        fund["end_page"] = fund_sections[j + 1]["start_page"] - 1
                    else:
                        fund["end_page"] = section["end_page"]
                # Adjust parent section to end before first fund
                section["end_page"] = fund_sections[0]["start_page"] - 1
                expanded.extend(fund_sections)

    return expanded


def compare_sections(
    original: list[dict], derived: list[dict]
) -> None:
    """Print a comparison between original and derived sections."""
    # Use (title, start_page) as key to handle duplicate titles like
    # "Bureau of Administration" which appears twice in the original
    orig_by_key: dict[str, list[dict]] = {}
    for s in original:
        orig_by_key.setdefault(s["title"], []).append(s)
    deriv_by_key: dict[str, list[dict]] = {}
    for s in derived:
        deriv_by_key.setdefault(s["title"], []).append(s)

    # Build ordered list of all entries to compare
    all_entries: list[dict] = []
    seen: set[tuple[str, int]] = set()
    for s in original + derived:
        key = (s["title"], s["start_page"])
        if key not in seen:
            all_entries.append(s)
            seen.add(key)
    all_entries.sort(key=lambda s: s["start_page"])

    print(f"{'Section':<55} {'Original':>15}  {'Derived':>15}  {'Status'}")
    print("-" * 110)

    matched_orig: set[int] = set()
    matched_deriv: set[int] = set()

    for entry in all_entries:
        title = entry["title"]
        start = entry["start_page"]

        # Find matching original entry (by title and close start_page)
        o = None
        for i, s in enumerate(orig_by_key.get(title, [])):
            if i not in matched_orig or len(orig_by_key[title]) == 1:
                if abs(s["start_page"] - start) <= 2 or s["start_page"] == start:
                    o = s
                    break

        # Find matching derived entry
        d = None
        for i, s in enumerate(deriv_by_key.get(title, [])):
            if abs(s["start_page"] - start) <= 2 or s["start_page"] == start:
                d = s
                break

        o_range = f"{o['start_page']}-{o.get('end_page', '?')}" if o else ""
        d_range = f"{d['start_page']}-{d.get('end_page', '?')}" if d else ""

        if o and d:
            if o["start_page"] == d["start_page"] and o.get("end_page") == d.get("end_page"):
                status = "OK"
            elif o["start_page"] == d["start_page"]:
                status = "END DIFFERS"
            else:
                status = "DIFFERS"
        elif o and not d:
            status = "ORIG ONLY"
        else:
            status = "NEW"

        print(f"{title:<55} {o_range:>15}  {d_range:>15}  {status}")


def main() -> None:
    pdf_path = "input/2026-operating-budget.pdf"
    original_path = "input/sections-operating.json"
    output_path = "input/sections_derived.json"

    print(f"Scanning {pdf_path}...")
    derived = derive_sections(pdf_path)
    print(f"Found {len(derived)} sections.\n")

    # Save derived sections
    with open(output_path, "w") as f:
        json.dump(derived, f, indent=2)
    print(f"Saved derived sections to {output_path}\n")

    # Compare with original
    with open(original_path) as f:
        original = json.load(f)

    compare_sections(original, derived)


if __name__ == "__main__":
    main()
