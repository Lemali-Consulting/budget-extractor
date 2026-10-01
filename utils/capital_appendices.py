"""Parse the three appendices in the Capital Budget Appendices PDF into clean
structured data (Appendix A: Projects by Department; B: CPFC Scoring; C: Glossary).

The spatial table extractor fragments these pages into dozens of tiny tables
because each row group is separated by a horizontal rule in the source PDF. The
custom parsers here read pdfplumber word positions directly and bin words by
known column x-ranges, then merge wrapped continuation rows."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pdfplumber


# Page layout differs between years, so data pages are discovered from the
# "Appendix X:" cover pages rather than hardcoded indices.
_COVER_RE: re.Pattern[str] = re.compile(r"^Appendix ([A-Z]):", re.MULTILINE)
# A cover or page-number-only page has far fewer words than a data page.
_MIN_DATA_PAGE_WORDS: int = 20


def locate_appendix_pages(pages: list[tuple[str, int]]) -> dict[str, list[int]]:
    """Map appendix letter -> 0-based indices of its data pages.

    `pages` holds (text, word_count) per PDF page. A cover page is a sparse page
    whose text has a line starting "Appendix X:"; the data pages for X are the
    non-sparse pages that follow it until the next cover.
    """
    found: dict[str, list[int]] = {}
    current: str | None = None
    for idx, (text, word_count) in enumerate(pages):
        is_sparse: bool = word_count < _MIN_DATA_PAGE_WORDS
        cover = _COVER_RE.search(text) if is_sparse else None
        if cover:
            current = cover.group(1)
            found[current] = []
        elif current is not None and not is_sparse:
            found[current].append(idx)
    return found


def _appendix_data_pages(pdf: pdfplumber.pdf.PDF, letter: str) -> list[int]:
    """Data-page indices for one appendix letter in an open PDF."""
    summaries: list[tuple[str, int]] = [
        (page.extract_text() or "", len(page.extract_words())) for page in pdf.pages
    ]
    return locate_appendix_pages(summaries).get(letter, [])


_PROJECTS_TITLE_RE: re.Pattern[str] = re.compile(r"^\d{4} Projects")
_APPENDIX_PDF_GLOB: str = "*_Capital_Budget_Appendices.pdf"


def is_projects_title_row(text: str) -> bool:
    """True for the per-page title row such as "2027 Projects by Department"."""
    return _PROJECTS_TITLE_RE.match(text) is not None


def find_appendix_pdf(split_dir: Path) -> Path:
    """Locate the Capital Budget Appendices PDF in a split-pdf directory (its numeric prefix varies by year)."""
    matches: list[Path] = sorted(split_dir.glob(_APPENDIX_PDF_GLOB))
    if not matches:
        raise FileNotFoundError(f"No {_APPENDIX_PDF_GLOB} found in {split_dir}")
    if len(matches) > 1:
        names: str = ", ".join(m.name for m in matches)
        raise ValueError(f"Multiple appendix PDFs match {_APPENDIX_PDF_GLOB} in {split_dir}: {names}")
    return matches[0]


def _cluster_rows(words: list[dict[str, Any]], y_tol: float = 3.0) -> list[list[dict[str, Any]]]:
    """Group words into rows by top y-coordinate."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    rows: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = [sorted_words[0]]
    for w in sorted_words[1:]:
        if abs(w["top"] - current[0]["top"]) <= y_tol:
            current.append(w)
        else:
            rows.append(sorted(current, key=lambda x: x["x0"]))
            current = [w]
    rows.append(sorted(current, key=lambda x: x["x0"]))
    return rows


def _parse_money(text: str) -> int:
    """Parse a string like '$1,300,000.00' or '420,313' into an int (cents truncated)."""
    s = text.replace("$", "").replace(",", "").strip()
    if not s:
        return 0
    # Strip trailing Y/N character that may be glued to amounts in the scoring table.
    while s and s[-1] in "YN":
        s = s[:-1]
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


# ----------------------------------------------------------------------
# Appendix A: Projects by Department
# ----------------------------------------------------------------------

# Column x0 ranges derived from word positions (see tests/dev exploration).
_A_COLS: list[tuple[str, float, float]] = [
    ("name",  10.0, 275.0),
    ("cdbg",  275.0, 345.0),
    ("bond",  345.0, 410.0),
    ("paygo", 410.0, 475.0),
    ("other", 475.0, 530.0),
    # Large 10-digit grand totals like $112,259,091 start near x=534;
    # smaller right-aligned amounts under "2026 Total" run into the 550s.
    ("total", 530.0, 600.0),
]


def _classify_a_col(x0: float) -> str | None:
    for name, lo, hi in _A_COLS:
        if lo <= x0 < hi:
            return name
    return None


def _is_section_break(top: float, page_height: float) -> bool:
    """Filter out page headers/footers."""
    # Column headers sit near the very top (~40-55); first data row starts ~61.
    # Page numbers sit ~57px from the bottom; CPFC running titles ~28px from
    # the bottom; the threshold needs to exclude both.
    return top < 60 or top > page_height - 60


def parse_appendix_a(pdf_path: Path | str) -> dict[str, Any]:
    """Return {'departments': [{name, projects:[{name, cdbg, bond, paygo, other, total}]}],
    'totals': {cdbg, bond, paygo, other, total}}."""
    departments: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    totals: dict[str, int] = {"cdbg": 0, "bond": 0, "paygo": 0, "other": 0, "total": 0}

    with pdfplumber.open(pdf_path) as pdf:
        for pidx in _appendix_data_pages(pdf, "A"):
            page = pdf.pages[pidx]
            words = [
                w for w in page.extract_words(use_text_flow=False)
                if not _is_section_break(w["top"], page.height)
            ]
            rows = _cluster_rows(words)
            for row in rows:
                cols: dict[str, list[str]] = {c[0]: [] for c in _A_COLS}
                for w in row:
                    col = _classify_a_col(w["x0"])
                    if col:
                        cols[col].append(w["text"])
                name = " ".join(cols["name"]).strip()
                if not name:
                    continue
                # Skip the table header row.
                if name == "Project Name":
                    continue
                # Skip the page title row "<year> Projects by Department".
                if is_projects_title_row(name):
                    continue

                amounts = {k: _parse_money(" ".join(cols[k])) for k in ("cdbg", "bond", "paygo", "other", "total")}
                has_amount = any(amounts.values())

                if name == "Totals":
                    totals = amounts
                    continue

                if not has_amount:
                    # Department / section header row.
                    current = {"name": name, "projects": []}
                    departments.append(current)
                else:
                    if current is None:
                        current = {"name": "(uncategorized)", "projects": []}
                        departments.append(current)
                    current["projects"].append({"name": name, **amounts})

    return {"departments": departments, "totals": totals}


# ----------------------------------------------------------------------
# Appendix B: CPFC Scoring
# ----------------------------------------------------------------------

# Column x0 ranges. Money columns share boundaries with their $-sign tokens.
_B_COLS: list[tuple[str, float, float]] = [
    ("project",     10.0, 130.0),
    ("deliverable", 130.0, 245.0),
    ("city",        245.0, 285.0),
    ("cdbg",        285.0, 320.0),
    ("other",       320.0, 355.0),
    ("adjusted",    355.0, 390.0),
    ("omb1",        390.0, 414.0),
    ("omb2",        414.0, 438.0),
    ("omb3",        438.0, 462.0),
    ("cc1",         462.0, 486.0),
    ("cc2",         486.0, 510.0),
    ("co1",         510.0, 534.0),
    ("count",       534.0, 567.0),
    ("adjusted_count", 567.0, 700.0),
]


def _classify_b_col(x0: float) -> str | None:
    for name, lo, hi in _B_COLS:
        if lo <= x0 < hi:
            return name
    return None


def _is_b_header_row(cols: dict[str, list[str]]) -> bool:
    project = " ".join(cols["project"]).strip()
    deliverable = " ".join(cols["deliverable"]).strip()
    return project == "Project" and deliverable == "Deliverable"


def _is_b_adjusted_label_row(cols: dict[str, list[str]]) -> bool:
    """The lone 'Adjusted' word that sits above 'Count' is sometimes its own row."""
    text = " ".join(t for vals in cols.values() for t in vals).strip()
    return text == "Adjusted"


def parse_appendix_b(pdf_path: Path | str) -> dict[str, Any]:
    """Return {'scoring': [{project, deliverable, city, cdbg, other, adjusted,
    omb1..3, cc1..2, co1, count, adjusted_count}]}."""
    scoring: list[dict[str, Any]] = []
    pending_project_parts: list[str] = []
    pending_deliverable_parts: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        for pidx in _appendix_data_pages(pdf, "B"):
            page = pdf.pages[pidx]
            words = [
                w for w in page.extract_words(use_text_flow=False)
                if not _is_section_break(w["top"], page.height)
            ]
            rows = _cluster_rows(words)
            for row in rows:
                cols: dict[str, list[str]] = {c[0]: [] for c in _B_COLS}
                for w in row:
                    col = _classify_b_col(w["x0"])
                    if col:
                        cols[col].append(w["text"])

                if _is_b_header_row(cols) or _is_b_adjusted_label_row(cols):
                    continue

                project = " ".join(cols["project"]).strip()
                deliverable = " ".join(cols["deliverable"]).strip()
                count_text = " ".join(cols["count"]).strip()
                adj_count_text = " ".join(cols["adjusted_count"]).strip()

                # A complete row has at least an adjusted_count value.
                is_complete = adj_count_text != ""

                if not is_complete:
                    # Buffer continuation fragments to merge with the next complete row.
                    if project:
                        pending_project_parts.append(project)
                    if deliverable:
                        pending_deliverable_parts.append(deliverable)
                    continue

                full_project = " ".join(pending_project_parts + [project]).strip()
                full_deliverable = " ".join(pending_deliverable_parts + [deliverable]).strip()
                pending_project_parts.clear()
                pending_deliverable_parts.clear()

                # The "adjusted" cell often glues a Y/N letter from omb1.
                adj_text = " ".join(cols["adjusted"])
                adj_amount, glued_yn = _split_amount_yn(adj_text)
                omb1_text = " ".join(cols["omb1"]).strip()
                if not omb1_text and glued_yn:
                    omb1_text = glued_yn

                row_data = {
                    "project": full_project,
                    "deliverable": full_deliverable,
                    "city": _parse_money(" ".join(cols["city"])),
                    "cdbg": _parse_money(" ".join(cols["cdbg"])),
                    "other": _parse_money(" ".join(cols["other"])),
                    "adjusted": adj_amount,
                    "omb1": omb1_text,
                    "omb2": " ".join(cols["omb2"]).strip(),
                    "omb3": " ".join(cols["omb3"]).strip(),
                    "cc1": " ".join(cols["cc1"]).strip(),
                    "cc2": " ".join(cols["cc2"]).strip(),
                    "co1": " ".join(cols["co1"]).strip(),
                    "count": int(count_text) if count_text.isdigit() else _maybe_int(count_text),
                    "adjusted_count": _maybe_float(adj_count_text),
                }
                scoring.append(row_data)

    return {"scoring": scoring}


def _split_amount_yn(text: str) -> tuple[int, str]:
    """Split '$1,300,000.00Y' → (1300000, 'Y'). Returns ('', '') if no number."""
    s = text.strip()
    if not s:
        return 0, ""
    # Find trailing Y or N letter glued to the amount.
    m = re.match(r"^(.*?)([YN])$", s)
    if m and "$" in m.group(1):
        return _parse_money(m.group(1)), m.group(2)
    return _parse_money(s), ""


def _maybe_int(text: str) -> int:
    try:
        return int(text.strip())
    except ValueError:
        return 0


def _maybe_float(text: str) -> float:
    try:
        return float(text.strip())
    except ValueError:
        return 0.0


# ----------------------------------------------------------------------
# Appendix C: Glossary
# ----------------------------------------------------------------------

_C_COLS: list[tuple[str, float, float]] = [
    ("acronym",     50.0, 200.0),
    ("name",        200.0, 355.0),
    ("description", 355.0, 600.0),
]


def _classify_c_col(x0: float) -> str | None:
    for name, lo, hi in _C_COLS:
        if lo <= x0 < hi:
            return name
    return None


def parse_appendix_c(pdf_path: Path | str) -> dict[str, Any]:
    """Return {'entries': [{acronym, name, description}]}."""
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    with pdfplumber.open(pdf_path) as pdf:
        for pidx in _appendix_data_pages(pdf, "C"):
            page = pdf.pages[pidx]
            words = [
                w for w in page.extract_words(use_text_flow=False)
                if not _is_section_break(w["top"], page.height)
            ]
            rows = _cluster_rows(words)
            for row in rows:
                cols: dict[str, list[str]] = {c[0]: [] for c in _C_COLS}
                for w in row:
                    col = _classify_c_col(w["x0"])
                    if col:
                        cols[col].append(w["text"])
                acronym = " ".join(cols["acronym"]).strip()
                name = " ".join(cols["name"]).strip()
                description = " ".join(cols["description"]).strip()

                # Skip the table header.
                if acronym == "ACRONYM/TERM" and name == "NAME":
                    continue
                # Skip blank rows.
                if not (acronym or name or description):
                    continue

                # When an acronym wraps onto a second line, the acronym column
                # has fresh text but the description column continues lowercased.
                is_acronym_wrap = bool(
                    acronym and description
                    and description.split()[0][0].islower()
                    and current is not None
                )

                if acronym and not is_acronym_wrap:
                    # Start a new entry.
                    if current is not None:
                        entries.append(current)
                    current = {"acronym": acronym, "name": name, "description": description}
                elif is_acronym_wrap and current is not None:
                    current["acronym"] = (current["acronym"] + " " + acronym).strip()
                    if name:
                        current["name"] = (current["name"] + " " + name).strip()
                    if description:
                        current["description"] = (current["description"] + " " + description).strip()
                else:
                    if current is None:
                        continue
                    if name:
                        current["name"] = (current["name"] + " " + name).strip()
                    if description:
                        current["description"] = (current["description"] + " " + description).strip()
        if current is not None:
            entries.append(current)

    return {"entries": entries}
