"""Extract tables from PDFs using spatial word clustering, for borderless tables."""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from pdfplumber.page import Page

# Max x-extent difference (pts) for a headerless table to inherit header-derived columns.
_PROPAGATION_EXTENT_TOLERANCE: float = 30.0
# Max distance (pts) a headerless totals block may start left of a table's first
# column and still be re-slotted into that table's columns.
_RESLOT_EXTENT_TOLERANCE: float = 5.0
# Grant tables (JDE Number, Funder, Grant, three amounts) put their column
# rules at these x-positions in the 2026 and 2027 operating budgets. A table
# that draws only its left and right border falls back to them.
STANDARD_GRANT_COLUMN_RULES_X: tuple[float, ...] = (54, 107, 212, 407, 458, 508, 558)
_OUTER_BORDER_RULE_COUNT: int = 2
_DOLLAR: str = "$"
_PERCENT: str = "%"
# One whitespace-delimited piece of a numeric cell: 1,234 / (1,234) / 1.2 /
# 1.2% / an em-dash nil / n/a. Used to recognize tokens made only of values.
_COMPOUND_VALUE_PIECE: re.Pattern[str] = re.compile(
    r"^\(?[\d,]*\d(\.\d+)?\)?%?$|^—$|^n/a$"
)


def _whitespace_pieces(chars: list[dict]) -> list[tuple[str, float, float]]:
    """Group a word's characters into whitespace-separated (text, x0, x1) pieces."""
    pieces: list[tuple[str, float, float]] = []
    text: str = ""
    x0: float = 0.0
    x1: float = 0.0
    for ch in chars:
        if ch["text"].isspace():
            if text:
                pieces.append((text, x0, x1))
                text = ""
            continue
        if not text:
            x0 = ch["x0"]
        text += ch["text"]
        x1 = ch["x1"]
    if text:
        pieces.append((text, x0, x1))
    return pieces


@dataclass
class SpatialColumn:
    """A detected column defined by its horizontal extent."""
    x0: float
    x1: float
    alignment: str  # "left" or "right"
    header: str = ""

    @property
    def center(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def width(self) -> float:
        return self.x1 - self.x0


@dataclass
class SpatialRow:
    """A detected row defined by its vertical extent."""
    y0: float
    y1: float
    cells: list[str] = field(default_factory=list)


@dataclass
class SpatialTable:
    """A table extracted via spatial clustering."""
    columns: list[SpatialColumn]
    rows: list[SpatialRow]
    headers: list[str] = field(default_factory=list)
    bbox: Optional[tuple[float, float, float, float]] = None
    bordered: bool = False
    _words: list[dict] = field(default_factory=list, repr=False)
    _dollar_separators: list[float] = field(default_factory=list, repr=False)

    def to_list(self) -> list[list[str]]:
        """Return the table as a list of rows, each row a list of cell strings."""
        result: list[list[str]] = []
        if self.headers:
            result.append(self.headers)
        for row in self.rows:
            result.append(row.cells)
        return result


@dataclass
class TextBlock:
    """A block of non-table text extracted from a page."""
    text: str
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    role: str  # "page_header" | "section_title" | "page_number" | "leading_prose" | "trailing_prose" | "mid_table_prose" | "footnote"


@dataclass
class ChartRegion:
    """A detected chart or image region on a page."""
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    chart_type: str  # "raster_image" | "vector_chart"


@dataclass
class PageContent:
    """All non-table content extracted from a single page."""
    page_index: int
    text_blocks: list[TextBlock] = field(default_factory=list)
    chart_regions: list[ChartRegion] = field(default_factory=list)


# ── Section detection for row grouping ────────────────────────────────

_CATEGORY_CODE_RE = re.compile(r"^\d{2}\s*-\s+[A-Z]")
# A numbered list entry such as a capital project-summary row ("129HOUSING
# DEVELOPMENT", its page number fused to the title). Consecutive entries are
# siblings, so one with blank amounts is still a data row, not a heading.
_NUMBERED_ENTRY_RE = re.compile(r"^\d+\s*[A-Za-z]")


def assign_sections(table: "SpatialTable") -> list[str]:
    """Assign a section label to each row based on detected section headers.

    Returns a list of section strings, one per row.  Section headers are rows
    matching one of:
      - Category codes like "51 - PERSONNEL-SALARIES & WAGES"
      - Text-only rows where all columns except the first are empty
        (program/division labels, bureau headers, fiscal labels)

    The section value propagates forward until a new section header is found.
    """
    num_cols = len(table.columns)
    sections: list[str] = []
    current_section = ""

    previous_first_cell = ""

    for row in table.rows:
        cells = row.cells
        first_cell = cells[0].strip() if cells else ""

        if not first_cell:
            sections.append(current_section)
            continue

        is_section = False

        # Pattern 1: Category code headers (e.g., "51 - PERSONNEL-SALARIES & WAGES")
        if _CATEGORY_CODE_RE.match(first_cell):
            is_section = True

        # Pattern 2: Text-only rows (first cell has text, rest empty)
        # — catches program headers, bureau headers, "Expenditures"/"Revenues" labels
        elif (
            num_cols > 1
            and all(c.strip() == "" for c in cells[1:])
            and not (_NUMBERED_ENTRY_RE.match(first_cell) and _NUMBERED_ENTRY_RE.match(previous_first_cell))
        ):
            # Exclude notes/footnotes
            if not first_cell.startswith("*") and not first_cell.startswith("Note:"):
                # Exclude date-only rows (debt service)
                if not re.match(r"^\d{1,2}/\d{1,2}/\d{4}$", first_cell):
                    # Exclude "Transfer to/for ..." zero-value line items
                    if not re.match(r"^Transfer (to|for) ", first_cell, re.IGNORECASE):
                        is_section = True

        if is_section:
            current_section = first_cell

        sections.append(current_section)
        previous_first_cell = first_cell

    # Post-processing: collapse single-row category-code sections.
    # In summary/forecast tables every row is a category code, making each
    # row its own section — which is noisy.  A category-code section that
    # groups only itself (1 row) is demoted back to its parent section.
    # Text-only header sections (Pattern 2) are kept regardless.
    if sections:
        # Build list of (section_label, start_idx, count) runs
        runs: list[tuple[str, int, int]] = []
        for i, s in enumerate(sections):
            if not runs or runs[-1][0] != s:
                runs.append((s, i, 1))
            else:
                runs[-1] = (runs[-1][0], runs[-1][1], runs[-1][2] + 1)

        effective_parent = ""
        for _run_idx, (label, start, count) in enumerate(runs):
            if count == 1 and _CATEGORY_CODE_RE.match(label):
                # Single-row category-code section → demote to parent
                sections[start] = effective_parent
            else:
                effective_parent = label

    return sections


# ── Color palette for debug visualization ───────────────────────────

_TABLE_COLORS = [
    (0.9, 1.0, 0.9),   # light green
    (0.9, 0.9, 1.0),   # light blue
    (1.0, 0.95, 0.85),  # light orange
    (1.0, 0.9, 1.0),   # light purple
    (0.9, 1.0, 1.0),   # light cyan
]

_BORDER_COLORS = [
    (0, 0.5, 0),       # green
    (0, 0, 0.8),       # blue
    (0.7, 0.4, 0),     # orange
    (0.6, 0, 0.6),     # purple
    (0, 0.5, 0.5),     # cyan
]


class SpatialTableExtractor:
    """
    Detect and extract tables from PDF pages by clustering word positions,
    designed for borderless tables with whitespace-separated columns.
    """

    def __init__(
        self,
        y_tolerance: float = 4.0,
        column_gap_threshold: float = 15.0,
        min_gap_frequency: float = 0.25,
        strip_dollar_signs: bool = True,
        x_tolerance: float = 3,
        word_y_tolerance: float = 3,
        rule_coverage_threshold: float = 0.5,
    ):
        """
        Args:
            y_tolerance: Max vertical distance (pts) to merge words into one row.
            column_gap_threshold: Min horizontal gap (pts) between words to split columns.
            min_gap_frequency: Fraction of multi-word rows that must have a gap at a
                position for it to count as a column separator (0.0-1.0).
            strip_dollar_signs: If True, remove standalone '$' words from output.
            x_tolerance: pdfplumber x_tolerance for word extraction.
            word_y_tolerance: pdfplumber y_tolerance for word extraction.
            rule_coverage_threshold: Fraction of the table region width a horizontal
                line must span to be treated as a sub-table separator.
        """
        self.y_tolerance = y_tolerance
        self.column_gap_threshold = column_gap_threshold
        self.min_gap_frequency = min_gap_frequency
        self.strip_dollar_signs = strip_dollar_signs
        self.x_tolerance = x_tolerance
        self.word_y_tolerance = word_y_tolerance
        self.rule_coverage_threshold = rule_coverage_threshold

    # ── Public API ──────────────────────────────────────────────────

    # ── Page header patterns ───────────────────────────────────────
    # Words on rows matching these patterns are stripped before table
    # detection. Each pattern is matched against the concatenated text
    # of a row (all words joined by space).
    PAGE_HEADER_PATTERNS: list[str] = [
        r"^City of Pittsburgh",
        r"^Fiscal Year \d{4}",
    ]

    def _filter_page_headers(self, words: list[dict]) -> list[dict]:
        """Remove page-level header/footer words, discarding captured text."""
        surviving, _ = self._filter_page_headers_captured(words)
        return surviving

    def _filter_page_headers_captured(
        self, words: list[dict],
    ) -> tuple[list[dict], list['TextBlock']]:
        """
        Remove words belonging to page-level headers/footers, returning
        both the surviving words and TextBlock objects for the removed text.

        Groups words into rows and removes rows that match either:
        1. A known PAGE_HEADER_PATTERN, or
        2. A single-word row that sits above any multi-word row (section
           titles like "Position Summary" that appear alone on their line).
        """
        import re

        rows = self._cluster_rows(words)
        remove_ids: set[int] = set()
        # Track the role of each removed row index
        removed_roles: dict[int, str] = {}

        # Pass 1: remove rows matching explicit patterns
        pattern_removed: set[int] = set()
        for ri, row in enumerate(rows):
            row_text = " ".join(
                w["text"].strip() for w in sorted(row, key=lambda w: w["x0"])
            )
            for pattern in self.PAGE_HEADER_PATTERNS:
                if re.search(pattern, row_text, re.IGNORECASE):
                    pattern_removed.add(ri)
                    removed_roles[ri] = "page_header"
                    for w in row:
                        remove_ids.add(id(w))
                    break

        # Pass 2: find the first surviving multi-word row, then remove
        # any single-word rows above it (section titles like "Position
        # Summary" that appear alone on their line).
        first_multi_y = None
        for ri, row in enumerate(rows):
            if ri not in pattern_removed and len(row) >= 2:
                first_multi_y = min(w["top"] for w in row)
                break

        if first_multi_y is not None:
            for ri, row in enumerate(rows):
                if ri in pattern_removed:
                    continue
                if len(row) == 1 and min(w["top"] for w in row) < first_multi_y:
                    removed_roles[ri] = "section_title"
                    for w in row:
                        remove_ids.add(id(w))

        # Pass 3: remove standalone page numbers at the bottom of the page.
        # Find the last surviving multi-word row; any single-word bare-integer
        # rows below it are almost certainly page footers (e.g., "243").
        last_multi_y = None
        for ri in reversed(range(len(rows))):
            if ri in pattern_removed:
                continue
            row = rows[ri]
            surviving = [w for w in row if id(w) not in remove_ids]
            if len(surviving) >= 2:
                last_multi_y = max(w["top"] for w in surviving)
                break

        if last_multi_y is not None:
            for ri, row in enumerate(rows):
                if ri in pattern_removed:
                    continue
                surviving = [w for w in row if id(w) not in remove_ids]
                if len(surviving) == 1:
                    w = surviving[0]
                    if w["top"] > last_multi_y and re.fullmatch(
                        r"\d{1,4}", w["text"].strip()
                    ):
                        removed_roles[ri] = "page_number"
                        remove_ids.add(id(w))

        # Build TextBlock objects from removed rows
        text_blocks: list[TextBlock] = []
        for ri, row in enumerate(rows):
            if ri not in removed_roles:
                continue
            row_words = sorted(row, key=lambda w: w["x0"])
            text = " ".join(w["text"].strip() for w in row_words)
            if not text.strip():
                continue
            x0 = min(w["x0"] for w in row_words)
            y0 = min(w["top"] for w in row_words)
            x1 = max(w["x1"] for w in row_words)
            y1 = max(w["bottom"] for w in row_words)
            text_blocks.append(TextBlock(
                text=text, bbox=(x0, y0, x1, y1), role=removed_roles[ri],
            ))

        return [w for w in words if id(w) not in remove_ids], text_blocks

    def extract(
        self,
        page: Page,
        bbox: Optional[tuple[float, float, float, float]] = None,
    ) -> SpatialTable:
        """
        Extract a single table from a page (or region). If the region contains
        multiple sub-tables separated by horizontal rules, they are merged into
        one table using the column structure of the densest sub-region. Use
        extract_tables() to get them as separate tables instead.
        """
        tables = self.extract_tables(page, bbox=bbox)
        if not tables:
            return SpatialTable(columns=[], rows=[])
        if len(tables) == 1:
            return tables[0]

        # Merge: use columns from the table with the most columns
        primary = max(tables, key=lambda t: len(t.columns))
        all_rows: list[SpatialRow] = []
        for t in tables:
            all_rows.extend(t.rows)
        all_rows.sort(key=lambda r: r.y0)

        return SpatialTable(columns=primary.columns, rows=all_rows, bbox=primary.bbox)

    @staticmethod
    def _has_simple_bordered_tables(page: Page) -> bool:
        """Detect whether a page uses small, hard-ruled (bordered) tables
        suitable for pdfplumber's native extraction.

        Returns True only when the page has vertical rule lines AND all
        detected tables have cleanly separated rows (no merged multi-row
        cells).  Large bordered tables where pdfplumber merges rows
        (e.g., grant listings) are rejected.
        """
        v_lines = [
            l for l in (page.lines or [])
            if abs(l["x0"] - l["x1"]) < 1
        ]
        if len(v_lines) < 2:
            return False

        # Probe tables with pdfplumber's native finder
        native_tables = page.find_tables()
        if not native_tables:
            return False

        for table in native_tables:
            rows = table.extract()
            if not rows:
                continue
            # Check if any data cell contains newlines — a sign that
            # pdfplumber merged multiple visual rows into one cell.
            # Grant tables produce 400-1500+ char cells with 10+ newlines;
            # simple bordered tables may have single-line wraps (~80 chars).
            for row in rows[1:]:  # skip header row
                for cell in row:
                    if cell and "\n" in cell and len(cell) > 200:
                        return False

        return True

    def _extract_bordered_tables(
        self,
        page: Page,
        bbox: Optional[tuple[float, float, float, float]] = None,
    ) -> list[SpatialTable]:
        """Extract tables from a page with hard-ruled borders using pdfplumber's
        native table detection, returning SpatialTable objects for compatibility.
        """
        target = page.crop(bbox) if bbox else page
        native_tables = target.find_tables()
        results: list[SpatialTable] = []

        for native in native_tables:
            extracted = native.extract()
            if not extracted or len(extracted) < 1:
                continue

            tb = native.bbox  # (x0, top, x1, bottom)
            num_cols = max(len(row) for row in extracted)

            # Build columns from the table's cell structure
            cells_info = native.cells  # list of (x0, top, x1, bottom)
            if cells_info:
                # Find unique x boundaries to define columns
                x_bounds: list[float] = sorted(set(
                    c[0] for c in cells_info
                ) | set(
                    c[2] for c in cells_info
                ))
                columns = []
                for i in range(len(x_bounds) - 1):
                    columns.append(SpatialColumn(
                        x0=x_bounds[i], x1=x_bounds[i + 1], alignment="right",
                    ))
                # Trim to actual column count if cell merging created extras
                if len(columns) > num_cols:
                    columns = columns[:num_cols]
            else:
                # Fallback: evenly divide the table bbox
                col_width = (tb[2] - tb[0]) / num_cols
                columns = [
                    SpatialColumn(
                        x0=tb[0] + i * col_width,
                        x1=tb[0] + (i + 1) * col_width,
                        alignment="right",
                    )
                    for i in range(num_cols)
                ]

            # Merge phantom columns that are None in nearly all rows.
            # pdfplumber sometimes finds cell boundaries that only exist in
            # one row (e.g., a header cell split into "Fee Des" | "cription")
            # while all data rows span across that boundary → None cells.
            if len(columns) > 1 and len(extracted) > 2:
                phantom_cols: set[int] = set()
                for ci in range(num_cols):
                    none_count = sum(
                        1 for row in extracted
                        if ci >= len(row) or row[ci] is None
                    )
                    # If ≥80% of rows are None, this column is phantom.
                    # 80% catches small tables (5-6 rows) where the phantom
                    # column has content only in 1 header-like row.
                    if none_count >= len(extracted) * 0.8:
                        phantom_cols.add(ci)
                if phantom_cols:
                    # Merge phantom columns into their left neighbor's x-extent
                    merged_columns: list[SpatialColumn] = []
                    merged_extracted: list[list[Optional[str]]] = []
                    for ci in range(len(columns)):
                        if ci in phantom_cols and merged_columns:
                            # Extend the previous column's right edge
                            merged_columns[-1] = SpatialColumn(
                                x0=merged_columns[-1].x0,
                                x1=columns[ci].x1,
                                alignment=merged_columns[-1].alignment,
                            )
                        else:
                            merged_columns.append(columns[ci])
                    # Rebuild extracted data, concatenating phantom column
                    # text into the left neighbor (e.g., "Fee Des" + "cription")
                    for row in extracted:
                        new_row: list[Optional[str]] = []
                        for ci in range(min(len(row), num_cols)):
                            if ci in phantom_cols:
                                # Append non-None text to the previous kept cell
                                if new_row and row[ci] is not None:
                                    prev = new_row[-1] or ""
                                    new_row[-1] = (prev + row[ci]).strip() or None
                            else:
                                new_row.append(row[ci])
                        merged_extracted.append(new_row)
                    columns = merged_columns
                    extracted = merged_extracted
                    num_cols = len(columns)

            # Separate header row (first row) from data rows
            headers: list[str] = []
            data_rows: list[list[str]] = []
            for ri, row in enumerate(extracted):
                # Clean cells: replace None, strip newlines
                cleaned = [
                    (cell or "").replace("\n", " ").strip()
                    for cell in row
                ]
                if ri == 0:
                    headers = cleaned
                else:
                    data_rows.append(cleaned)

            # Strip dollar signs from data cells if configured
            if self.strip_dollar_signs:
                for row in data_rows:
                    for ci, cell in enumerate(row):
                        c = cell.strip()
                        if c.startswith("$"):
                            c = c[1:].strip()
                        if c.startswith("(") and c.endswith(")"):
                            # Keep parens for negative values, just strip $
                            pass
                        row[ci] = c

            # Build SpatialRow objects
            row_height = (tb[3] - tb[1]) / max(len(extracted), 1)
            spatial_rows = []
            for ri, row in enumerate(data_rows):
                y0 = tb[1] + (ri + 1) * row_height
                y1 = y0 + row_height
                spatial_rows.append(SpatialRow(y0=y0, y1=y1, cells=row))

            table = SpatialTable(
                columns=columns,
                rows=spatial_rows,
                headers=headers,
                bbox=tb,
                bordered=True,
            )
            self._merge_group_headers(table)
            results.append(table)

        return results

    @staticmethod
    def _is_grant_page(page: Page) -> bool:
        """Detect whether a page contains large bordered grant tables.

        Grant pages have vertical lines (bordered tables) but pdfplumber
        either merges data rows into single cells or fails to find the
        data area entirely.  Detected by having vertical lines AND either:
        - a native table with merged multi-row cells (long newline text), or
        - a native table with a header-only row containing grant-like
          column names (JDE, Funder, Grant, Amount).
        """
        v_lines = [
            l for l in (page.lines or [])
            if abs(l["x0"] - l["x1"]) < 1
        ]
        if len(v_lines) < 2:
            return False

        # Grant tables have many internal vertical separators (>4 unique
        # x-positions for 6+ column layouts).  Simple 2-column bordered
        # tables (e.g., fee schedules) have only 3 unique x-positions
        # (left, middle, right) and must not be misdetected.
        unique_x = set()
        for l in v_lines:
            unique_x.add(round(l["x0"]))
        has_internal_separators = len(unique_x) > 4

        native_tables = page.find_tables()
        for table in native_tables:
            rows = table.extract()
            if not rows:
                continue
            # Check for merged multi-row cells — only if the table has
            # internal vertical separators (otherwise it's just outer borders
            # and pdfplumber merges everything, which is not a grant signal)
            if has_internal_separators:
                for row in rows[1:]:
                    for cell in row:
                        if cell and "\n" in cell and len(cell) > 200:
                            return True
            # Check for grant-like header row (JDE/Funder/Grant/Amount)
            for row in rows:
                row_text = " ".join((c or "") for c in row).lower()
                if "funder" in row_text and "grant" in row_text:
                    return True
        return False

    def _extract_grant_tables(self, page: Page) -> list[SpatialTable]:
        """Extract grant tables from a page with large bordered tables.

        Grant pages have a consistent 6-column structure (JDE Number,
        Funder, Grant, Amount Awarded, Amount Spent, Remaining Balance)
        grouped by department.  Each department section has a title row,
        a header row, and multiple data rows.

        Row boundaries are determined by the y-positions of monetary
        values (Amount Awarded / Spent / Balance), which appear exactly
        once per data row.  Midpoints between consecutive monetary
        y-positions define the row splits.

        Returns one SpatialTable per department section, with a
        'Department' column prepended.
        """
        import re

        # Use x_tolerance=1 to prevent $ signs from bridging columns
        words = page.extract_words(
            keep_blank_chars=True,
            x_tolerance=1,
            y_tolerance=self.word_y_tolerance,
        )
        words = [w for w in words if w["text"].strip()]

        # Derive column boundaries from vertical lines
        v_lines = [
            l for l in (page.lines or [])
            if abs(l["x0"] - l["x1"]) < 1
        ]
        x_positions = sorted(set(round(l["x0"]) for l in v_lines))

        # Cluster nearby x-positions (double lines at boundaries)
        col_boundaries: list[float] = []
        for x in x_positions:
            if not col_boundaries or x - col_boundaries[-1] > 5:
                col_boundaries.append(x)
            else:
                col_boundaries[-1] = (col_boundaries[-1] + x) / 2

        if len(col_boundaries) < 2:
            return []
        if len(col_boundaries) == _OUTER_BORDER_RULE_COUNT:
            # Some grant pages draw only the table's outer border; their
            # columns sit where every other grant page's rules put them.
            col_boundaries = list(STANDARD_GRANT_COLUMN_RULES_X)

        # Monetary columns start at the 4th column boundary (index 3)
        monetary_x0 = col_boundaries[3] if len(col_boundaries) > 3 else 400

        results: list[SpatialTable] = []

        # Use pdfplumber's native table detection to find department sections
        native_tables = page.find_tables()
        for native in native_tables:
            extracted = native.extract()
            if not extracted or len(extracted) < 2:
                continue

            # First row is the department title
            title_row = extracted[0]
            dept_name = (title_row[0] or "").replace("\n", " ").strip()
            if not dept_name:
                continue

            tb_raw = native.bbox  # (x0, top, x1, bottom)

            # On continuation pages the native table may only cover the
            # title+header area while data extends far below.  Detect this
            # by checking if outer vertical border lines that START within
            # the table's y-extent extend beyond the table's bottom.
            # Only use lines contiguous with the table (top within bbox)
            # to avoid picking up borders from a separate table below.
            tb_bottom = tb_raw[3]
            for vl in v_lines:
                if abs(vl["x0"] - tb_raw[0]) < 3 or abs(vl["x0"] - tb_raw[2]) < 3:
                    vl_top = min(vl["top"], vl["bottom"])
                    vl_bot = max(vl["top"], vl["bottom"])
                    # Line must start within (or near) the table's y-extent
                    if vl_top <= tb_raw[3] + 2 and vl_bot > tb_bottom:
                        tb_bottom = vl_bot
            tb = (tb_raw[0], tb_raw[1], tb_raw[2], tb_bottom)

            # Find words within this table's extent
            table_words = [
                w for w in words
                if tb[1] <= w["top"] <= tb[3]
                and tb[0] <= w["x0"] <= tb[2]
            ]

            # Skip header words: find the header row y-extent.
            # Headers contain "Funder", "Grant", "Awarded" etc.
            header_bottom = tb[1]
            for w in table_words:
                t = w["text"].strip().lower()
                if t in ("funder", "grant", "awarded", "spent",
                         "balance", "number", "jde", "amount",
                         "remaining"):
                    header_bottom = max(header_bottom, w["bottom"])
            data_words = [w for w in table_words if w["top"] > header_bottom]

            # Find monetary data lines: words in monetary columns
            # (x0 >= monetary_x0) that look like numbers, grouped by y.
            # Exclude header-like words.
            monetary_words = [
                w for w in data_words
                if w["x0"] >= monetary_x0 - 5
                and re.search(r'\d', w["text"])
            ]
            if not monetary_words:
                continue

            # Group monetary words into lines by y-position
            monetary_lines: list[float] = []
            for w in sorted(monetary_words, key=lambda w: w["top"]):
                if not monetary_lines or abs(w["top"] - monetary_lines[-1]) > 5:
                    monetary_lines.append(w["top"])

            if not monetary_lines:
                continue

            # Compute row boundaries: each row extends from the previous
            # row's bottom to this row's bottom.  The bottom is the smaller
            # of the midpoint to the next data line and the data line
            # plus a maximum continuation distance (prevents funder text
            # from the next row bleeding into this one).
            max_continuation: float = 12.0
            row_bottoms: list[float] = []
            for mi, my in enumerate(monetary_lines):
                if mi + 1 < len(monetary_lines):
                    midpoint = (my + monetary_lines[mi + 1]) / 2
                    row_bottoms.append(min(midpoint, my + max_continuation))
                else:
                    row_bottoms.append(tb[3])

            row_boundaries: list[tuple[float, float]] = []
            for mi, my in enumerate(monetary_lines):
                row_top = header_bottom if mi == 0 else row_bottoms[mi - 1]
                row_boundaries.append((row_top, row_bottoms[mi]))

            # Build columns and headers
            headers = ["Department", "JDE Number", "Funder", "Grant",
                       "Amount Awarded", "Amount Spent", "Remaining Balance"]
            columns = [
                SpatialColumn(x0=0, x1=1, alignment="left"),  # Department
            ]
            for i in range(len(col_boundaries) - 1):
                columns.append(SpatialColumn(
                    x0=col_boundaries[i],
                    x1=col_boundaries[i + 1],
                    alignment="right" if i >= 3 else "left",
                ))

            # Build data rows
            spatial_rows: list[SpatialRow] = []
            for row_top, row_bottom in row_boundaries:
                row_words = [
                    w for w in data_words
                    if row_top <= w["top"] < row_bottom
                ]

                cells: list[str] = [dept_name]
                for ci in range(len(col_boundaries) - 1):
                    cx0 = col_boundaries[ci]
                    cx1 = col_boundaries[ci + 1]
                    col_words = sorted(
                        [w for w in row_words
                         if w["x0"] >= cx0 - 2 and w["x0"] < cx1],
                        key=lambda w: (w["top"], w["x0"]),
                    )
                    if self.strip_dollar_signs:
                        col_words = [
                            w for w in col_words
                            if w["text"].strip() not in ("$", "")
                        ]
                    cell_text = " ".join(
                        w["text"].strip().lstrip("$").strip()
                        for w in col_words
                    ).strip()
                    # Strip leading/trailing commas (PDF text artifacts)
                    cell_text = cell_text.strip(",").strip()
                    cells.append(cell_text)

                spatial_rows.append(SpatialRow(
                    y0=row_top, y1=row_bottom, cells=cells,
                ))

            if spatial_rows:
                results.append(SpatialTable(
                    columns=columns,
                    rows=spatial_rows,
                    headers=headers,
                    bbox=tb,
                ))

        return results

    def extract_page_content(
        self,
        page: Page,
        bbox: Optional[tuple[float, float, float, float]] = None,
    ) -> tuple[list[SpatialTable], 'PageContent']:
        """Extract tables and non-table content from a page.

        Uses a residual approach: after table extraction, all words NOT
        inside any table bbox are collected and clustered into text blocks.

        Returns:
            A tuple of (tables, page_content) where page_content contains
            text blocks and detected chart/image regions.
        """
        tables = self.extract_tables(page, bbox=bbox, _capture_text=True)
        pipeline_blocks = getattr(self, '_captured_text_blocks', [])

        table_bboxes = [t.bbox for t in tables if t.bbox]

        # Residual text capture: find all words outside table regions
        target = page.crop(bbox) if bbox else page
        all_words = target.extract_words(
            keep_blank_chars=True,
            x_tolerance=self.x_tolerance,
            y_tolerance=self.word_y_tolerance,
        )
        all_words = [w for w in all_words if w["text"].strip()]

        residual_blocks = self._extract_residual_text(
            all_words, table_bboxes, pipeline_blocks,
        )

        # Merge strategy: use residual blocks as the primary source for
        # narrative text (they capture full page text reliably). Keep pipeline
        # blocks only for roles that the residual classifier can't determine
        # (footnote, mid_table_prose — these come from inside table processing).
        # For page_header/section_title/page_number, prefer pipeline if it
        # exists, otherwise use residual.
        table_specific_roles = {"footnote", "mid_table_prose"}
        all_blocks: list[TextBlock] = []

        # Always include pipeline blocks with table-specific roles
        for block in pipeline_blocks:
            if block.role in table_specific_roles:
                all_blocks.append(block)

        # For residual blocks, check they don't substantially duplicate
        # pipeline blocks with table-specific roles
        table_block_y_ranges = [
            (b.bbox[1], b.bbox[3]) for b in all_blocks
        ]
        for block in residual_blocks:
            by0, by1 = block.bbox[1], block.bbox[3]
            is_dup = any(
                py0 - 3 <= by0 <= py1 + 3 and py0 - 3 <= by1 <= py1 + 3
                for py0, py1 in table_block_y_ranges
            )
            if not is_dup:
                all_blocks.append(block)

        chart_regions = self._detect_chart_regions(page, table_bboxes)

        content = PageContent(
            page_index=page.page_number - 1,
            text_blocks=sorted(all_blocks, key=lambda b: b.bbox[1]),
            chart_regions=chart_regions,
        )
        return tables, content

    def _extract_residual_text(
        self,
        all_words: list[dict],
        table_bboxes: list[tuple[float, float, float, float]],
        pipeline_blocks: list['TextBlock'],
    ) -> list['TextBlock']:
        """Find words outside table bboxes and cluster into text blocks."""
        import re

        # Filter to words outside all table bounding boxes (with padding)
        pad = 3.0
        outside_words = []
        for w in all_words:
            wx, wy = (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2
            in_table = any(
                tx0 - pad <= wx <= tx1 + pad and ty0 - pad <= wy <= ty1 + pad
                for tx0, ty0, tx1, ty1 in table_bboxes
            )
            if not in_table:
                outside_words.append(w)

        if not outside_words:
            return []

        # Cluster into rows by y-position
        rows = self._cluster_rows(outside_words)

        # Group consecutive rows into blocks separated by large y-gaps
        blocks: list[TextBlock] = []
        current_rows: list[list[dict]] = []
        prev_y1 = None
        gap_threshold = 18.0  # pts — roughly 1.5 line heights

        for row in rows:
            row_y0 = min(w["top"] for w in row)
            if prev_y1 is not None and row_y0 - prev_y1 > gap_threshold:
                # Flush current block
                block = self._rows_to_text_block(current_rows)
                if block:
                    blocks.append(block)
                current_rows = []
            current_rows.append(row)
            prev_y1 = max(w["bottom"] for w in row)

        if current_rows:
            block = self._rows_to_text_block(current_rows)
            if block:
                blocks.append(block)

        # Classify roles
        for block in blocks:
            block.role = self._classify_text_block(block)

        return blocks

    def _rows_to_text_block(
        self, rows: list[list[dict]],
    ) -> 'TextBlock | None':
        """Convert a group of word rows into a single TextBlock."""
        if not rows:
            return None
        all_words = [w for row in rows for w in row]
        if not all_words:
            return None

        lines: list[str] = []
        for row in rows:
            sorted_w = sorted(row, key=lambda w: w["x0"])
            line = " ".join(w["text"].strip() for w in sorted_w)
            if line.strip():
                lines.append(line)

        text = "\n".join(lines)
        if not text.strip():
            return None

        x0 = min(w["x0"] for w in all_words)
        y0 = min(w["top"] for w in all_words)
        x1 = max(w["x1"] for w in all_words)
        y1 = max(w["bottom"] for w in all_words)

        return TextBlock(text=text, bbox=(x0, y0, x1, y1), role="")

    @staticmethod
    def _classify_text_block(block: 'TextBlock') -> str:
        """Classify a residual text block by its content and shape."""
        import re

        text = block.text.strip()
        lines = text.split("\n")

        # Page numbers
        if len(lines) == 1 and re.fullmatch(r"\d{1,4}", text):
            return "page_number"

        # Page headers (known patterns)
        if any(re.search(p, text, re.IGNORECASE) for p in [
            r"^City of Pittsburgh",
            r"^Fiscal Year \d{4}",
        ]):
            return "page_header"

        # Short standalone headings (1-2 lines, short text, often bold)
        total_chars = len(text)
        if len(lines) <= 2 and total_chars < 80:
            return "section_title"

        # Default: narrative prose
        return "narrative"

    @staticmethod
    def _detect_chart_regions(
        page: Page,
        table_bboxes: list[tuple[float, float, float, float]],
    ) -> list['ChartRegion']:
        """Detect raster images and vector chart regions on a page."""
        regions: list[ChartRegion] = []

        def _overlaps_table(bbox: tuple[float, float, float, float]) -> bool:
            x0, y0, x1, y1 = bbox
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            for tx0, ty0, tx1, ty1 in table_bboxes:
                if tx0 <= cx <= tx1 and ty0 <= cy <= ty1:
                    return True
            return False

        # Raster images
        for img in page.images:
            x0, y0 = img["x0"], img["top"]
            x1, y1 = img["x1"], img["bottom"]
            w, h = x1 - x0, y1 - y0
            if w < 50 or h < 50:
                continue
            bbox = (x0, y0, x1, y1)
            if not _overlaps_table(bbox):
                # Small images (both dims ≤220) are logos/seals, not charts
                ctype = "logo" if w <= 220 and h <= 220 else "raster_image"
                regions.append(ChartRegion(bbox=bbox, chart_type=ctype))

        # Vector chart detection: clusters of drawing objects outside tables
        drawing_objs: list[tuple[float, float, float, float]] = []
        for obj in page.lines + page.rects + page.curves:
            obj_bbox = (obj["x0"], obj["top"], obj["x1"], obj["bottom"])
            if not _overlaps_table(obj_bbox):
                drawing_objs.append(obj_bbox)

        if len(drawing_objs) >= 20:
            # Compute bounding box of all non-table vector objects
            all_x0 = min(b[0] for b in drawing_objs)
            all_y0 = min(b[1] for b in drawing_objs)
            all_x1 = max(b[2] for b in drawing_objs)
            all_y1 = max(b[3] for b in drawing_objs)
            chart_bbox = (all_x0, all_y0, all_x1, all_y1)

            # Check the region has few text words (charts have labels, not prose)
            words = page.extract_words()
            words_in_region = [
                w for w in words
                if all_x0 <= w["x0"] <= all_x1 and all_y0 <= w["top"] <= all_y1
            ]
            # A chart region has many drawing objects relative to words
            if len(drawing_objs) > len(words_in_region) * 2:
                regions.append(ChartRegion(
                    bbox=chart_bbox, chart_type="vector_chart",
                ))

        return regions

    def extract_tables(
        self,
        page: Page,
        bbox: Optional[tuple[float, float, float, float]] = None,
        *,
        _capture_text: bool = False,
    ) -> list[SpatialTable]:
        """
        Extract tables from a page, automatically splitting into sub-tables
        when full-width horizontal rules are found.

        For pages with hard-ruled (bordered) tables, delegates to pdfplumber's
        native table detection. For borderless pages, uses spatial word
        clustering.

        Args:
            page: A pdfplumber Page.
            bbox: Optional (x0, top, x1, bottom) to crop the page first.
            _capture_text: Internal flag. When True, populates
                self._captured_text_blocks with non-table text.

        Returns:
            List of SpatialTable objects, one per detected sub-table.
        """
        if _capture_text:
            self._captured_text_blocks: list[TextBlock] = []

        # Route to grant table extraction for large bordered grant tables
        # (checked before simple bordered, as grant pages can appear simple)
        if self._is_grant_page(page):
            return self._extract_grant_tables(page)

        # Route to bordered extraction if the page has small bordered tables
        if self._has_simple_bordered_tables(page):
            return self._extract_bordered_tables(page, bbox=bbox)

        target = page.crop(bbox) if bbox else page
        words = target.extract_words(
            keep_blank_chars=True,
            x_tolerance=self.x_tolerance,
            y_tolerance=self.word_y_tolerance,
            return_chars=True,
        )
        if not words:
            return []
        words = self._split_compound_value_tokens(words)

        # Save whitespace-only words — pdfplumber with keep_blank_chars
        # can produce blank words at positions where '$' signs appear on
        # other rows. These are stripped from the main word list but passed
        # to dollar separator detection as placeholder markers.
        whitespace_words = [w for w in words if not w["text"].strip()]
        words = [w for w in words if w["text"].strip()]

        # Filter out page-level header/footer words (e.g., "City of
        # Pittsburgh Operating Budget", "Fiscal Year 2026", page numbers).
        if _capture_text:
            words, header_blocks = self._filter_page_headers_captured(words)
            self._captured_text_blocks.extend(header_blocks)
        else:
            words = self._filter_page_headers(words)
        if not words:
            return []

        # Find dollar-sign-derived column separators before stripping '$'.
        # Include whitespace placeholders that share x-positions with '$'
        # signs — these are dollar-sign placeholders on detail rows.
        dollar_separators: list[float] = []
        if self.strip_dollar_signs:
            non_dollar = [w for w in words if w["text"].strip() != "$"]
            # Find x-buckets where actual '$' signs exist
            dollar_x_buckets = set()
            for w in words:
                if w["text"].strip() == "$":
                    dollar_x_buckets.add(round(w["x0"] / 5) * 5)
            # Only include whitespace words at those same x-positions
            relevant_ws = [
                w for w in whitespace_words
                if round(w["x0"] / 5) * 5 in dollar_x_buckets
            ]
            all_for_dollar = words + relevant_ws
            dollar_separators = self._find_dollar_separators(
                all_for_dollar, non_dollar
            )
            words = non_dollar

        if not words:
            return []

        # Determine the content extent
        content_x0 = min(w["x0"] for w in words)
        content_x1 = max(w["x1"] for w in words)
        content_width = content_x1 - content_x0
        content_y0 = min(w["top"] for w in words)
        content_y1 = max(w["bottom"] for w in words)

        # Find horizontal rules that span most of the content width
        split_ys = self._find_table_separators(
            target, content_x0, content_x1, content_width, content_y0, content_y1,
            words=words,
        )

        # Compute background bands for use in continuation-table merging
        bg_bands = self._find_background_bands(
            target, content_x0, content_width, content_y0, content_y1,
        )

        # Build sub-regions
        region_bounds = self._build_sub_regions(split_ys, content_y0, content_y1)

        # Extract a table from each sub-region.
        # Only pad with y_tolerance at the outermost edges (first top,
        # last bottom) — not at internal separator boundaries, to prevent
        # rows near separators from appearing in two tables.
        tables: list[SpatialTable] = []
        for ri, (region_top, region_bottom) in enumerate(region_bounds):
            is_first = (ri == 0)
            is_last = (ri == len(region_bounds) - 1)
            top_bound = region_top - self.y_tolerance if is_first else region_top
            bottom_bound = region_bottom + self.y_tolerance if is_last else region_bottom
            region_words = [
                w for w in words
                if w["top"] >= top_bound
                and w["top"] <= bottom_bound
            ]
            if not region_words:
                continue

            # Filter dollar separators to those within this region's x-range
            region_x0 = min(w["x0"] for w in region_words)
            region_x1 = max(w["x1"] for w in region_words)
            region_dollar_seps = [
                x for x in dollar_separators
                if region_x0 < x < region_x1
            ]

            row_groups = self._cluster_rows(region_words)
            if not row_groups:
                continue

            # Filter out prose/footnote rows before column detection so
            # wide paragraph tokens don't distort column boundaries.
            data_row_groups, prose_rows = self._filter_prose_rows(
                row_groups, region_x1 - region_x0,
                column_gap_threshold=self.column_gap_threshold,
            )
            if _capture_text and prose_rows:
                self._captured_text_blocks.extend(
                    self._prose_rows_to_text_blocks(
                        prose_rows, row_groups, data_row_groups,
                    )
                )
            if not data_row_groups:
                continue
            data_words = [w for row in data_row_groups for w in row]

            columns = self._detect_columns(
                data_words, data_row_groups, dollar_separators=region_dollar_seps,
            )
            rows = self._assign_cells(data_row_groups, columns)
            columns, rows = self._remove_empty_columns(columns, rows)
            columns, rows = self._collapse_sparse_label_columns(columns, rows)

            r_x0 = min(c.x0 for c in columns)
            r_x1 = max(c.x1 for c in columns)
            r_y0 = rows[0].y0 if rows else region_top
            r_y1 = rows[-1].y1 if rows else region_bottom

            tables.append(SpatialTable(
                columns=columns,
                rows=rows,
                bbox=(r_x0, r_y0, r_x1, r_y1),
                _words=data_words,
                _dollar_separators=region_dollar_seps,
            ))

        # Merge small header-like sub-tables into the following data table
        tables = self._merge_header_tables(tables)

        # Merge continuation tables: consecutive sub-tables with the same
        # headers that were separated only by a horizontal rule (not a
        # colored band). This handles personnel pages where the summary
        # totals are visually separated from the detail rows but belong
        # to the same logical table.
        tables = self._merge_continuation_tables(tables, bg_bands)

        # For tables without headers, check if the first rows are internal
        # headers (multi-line column labels within the table itself)
        for table in tables:
            if not table.headers:
                self._extract_internal_headers(table)

        # Merge hierarchical group headers with sub-column headers using "|"
        for table in tables:
            self._merge_group_headers(table)

        # Split columns where known header patterns were merged due to
        # tight spacing (e.g., "Increase/(Decrease)" and "% Change").
        for table in tables:
            self._split_known_merged_columns(table)

        # Adjust column boundaries where Rate/Grade and Hours/Months
        # headers got merged into one column due to tight spacing.
        for table in tables:
            self._fix_merged_rate_hours_boundary(table)

        # Split columns where FTE and Rate/Grade are merged (e.g.,
        # part-time tables with "—  50.50" in a single column).
        for table in tables:
            self._split_merged_fte_rate(table)

        # Collapse phantom columns created by dollar-sign separators.
        # Must run after header merging (which re-detects columns) and
        # after column splitting (which changes column count).
        for table in tables:
            table.columns, table.rows = self._collapse_sparse_label_columns(
                table.columns, table.rows, table.headers,
            )

        # Merge multi-line row fragments (e.g., wrapped position titles)
        for table in tables:
            table.rows = self._merge_multiline_rows(table.rows)

        # Strip trailing caption/footer rows (e.g., "Deliverables are
        # tentative and are subject to change") that have content in only
        # one cell and don't look like data values.
        for table in tables:
            if _capture_text:
                self._captured_text_blocks.extend(
                    self._strip_peripheral_captions_captured(table)
                )
            else:
                self._strip_peripheral_captions(table)

        # Strip trailing chart labels separated by a large vertical gap
        for table in tables:
            self._strip_trailing_chart_labels(table)

        # Split tables that contain mid-table prose (footnotes between
        # two distinct table sections with separate headers).
        if _capture_text:
            tables, mid_prose_blocks = self._split_tables_at_mid_prose_captured(tables)
            self._captured_text_blocks.extend(mid_prose_blocks)
        else:
            tables = self._split_tables_at_mid_prose(tables)

        # Filter out false-positive tables (prose text blocks, page numbers)
        tables = [t for t in tables if self._is_real_table(t)]

        return tables

    def _find_dollar_separators(
        self,
        all_words: list[dict],
        non_dollar_words: list[dict],
    ) -> list[float]:
        """
        Find column separator positions implied by standalone '$' signs
        or whitespace-only placeholder words at the same x-positions.

        A '$' (or its space placeholder) marks a column boundary only when
        there is a significant gap before it (i.e., it starts a new column).
        '$' signs that sit right next to a preceding number (tiny gap) are
        just in-column prefixes.
        """
        # Include both '$' signs and whitespace-only placeholders
        dollar_words = [
            w for w in all_words
            if w["text"].strip() in ("$", "")
        ]
        if not dollar_words:
            return []

        # Group by y-row so we can find the preceding word on the same line
        from collections import defaultdict
        rows: dict[int, list[dict]] = defaultdict(list)
        for w in all_words:
            row_key = round(w["top"] / self.y_tolerance) * int(self.y_tolerance)
            rows[row_key].append(w)

        # For each $ occurrence, measure the gap before it
        gap_by_x: dict[int, list[float]] = defaultdict(list)
        for dw in dollar_words:
            row_key = round(dw["top"] / self.y_tolerance) * int(self.y_tolerance)
            row = sorted(rows[row_key], key=lambda w: w["x0"])
            # Find preceding word
            prev_x1 = None
            for w in row:
                if w["x0"] >= dw["x0"]:
                    break
                prev_x1 = w["x1"]
            gap = dw["x0"] - prev_x1 if prev_x1 is not None else 999.0
            # Bucket by x-position (cluster nearby $ positions)
            x_bucket = round(dw["x0"] / 5) * 5
            gap_by_x[x_bucket].append(gap)

        # A $ cluster marks a true column boundary when it consistently has
        # a large gap before it. If the majority of gaps are tiny (< 8pt),
        # then in most rows the $ sits right next to the preceding value —
        # it's an in-column currency prefix, not a column boundary marker.
        # We accept a position as a separator only when tiny gaps are NOT
        # the dominant pattern (i.e., < 60% tiny).
        tiny_threshold = 8.0
        result: list[float] = []
        for x_bucket, gaps in sorted(gap_by_x.items()):
            if len(gaps) < 2:
                continue
            large_gaps = [g for g in gaps if g >= self.column_gap_threshold]
            tiny_gaps = [g for g in gaps if g < tiny_threshold]
            if len(large_gaps) >= 2 and len(tiny_gaps) / len(gaps) <= 0.6:
                result.append(float(x_bucket))

        return result

    # ── Sub-table splitting ─────────────────────────────────────────

    def _find_table_separators(
        self,
        target: Page,
        content_x0: float,
        content_x1: float,
        content_width: float,
        content_y0: float,
        content_y1: float,
        words: list[dict] | None = None,
        large_gap_factor: float = 4.0,
    ) -> list[float]:
        """
        Find y-positions that split sub-tables, using three signals:
        1. Full-width horizontal rules (lines).
        2. Background-colored bands (filled rects) that visually separate
           rows like "Projected Beginning/Ending Balance".
        3. Large vertical gaps between rows (e.g., a page number far below
           the last data row). A gap is "large" if it exceeds
           large_gap_factor × the median row spacing.
        """
        candidate_ys: list[float] = []

        # ── Signal 1: horizontal rules ──
        lines = list(target.lines) + [
            r for r in target.rects
            if abs(r["bottom"] - r["top"]) < 2  # thin rects act as rules
        ]

        left_margin = content_x0 + content_width * 0.15
        for line in lines:
            if abs(line["bottom"] - line["top"]) > 2:
                continue
            line_y = (line["top"] + line["bottom"]) / 2
            if line_y < content_y0 - 5 or line_y > content_y1 + 5:
                continue
            line_width = line["x1"] - line["x0"]
            if line_width / content_width < self.rule_coverage_threshold:
                continue
            if line["x0"] > left_margin:
                continue
            candidate_ys.append(line_y)

        # ── Signal 2: background-colored bands ──
        # Find filled rects (height > 5pt) that together span most of the
        # content width at the same y-position. These form shaded row bands.
        bg_bands = self._find_background_bands(
            target, content_x0, content_width, content_y0, content_y1,
        )
        # Add separators at the top and bottom edges of each band
        for band_top, band_bottom in bg_bands:
            candidate_ys.append(band_top)
            candidate_ys.append(band_bottom)

        # ── Signal 3: large vertical gaps between rows ──
        if words:
            row_groups = self._cluster_rows(words)
            if len(row_groups) >= 2:
                row_tops = sorted(
                    min(w["top"] for w in rg) for rg in row_groups
                )
                spacings = [
                    row_tops[i + 1] - row_tops[i]
                    for i in range(len(row_tops) - 1)
                ]
                spacings_sorted = sorted(spacings)
                median_spacing = spacings_sorted[len(spacings_sorted) // 2]

                for i, spacing in enumerate(spacings):
                    if spacing > median_spacing * large_gap_factor:
                        # Place separator at the midpoint of the large gap
                        candidate_ys.append(
                            (row_tops[i] + row_tops[i + 1]) / 2
                        )

        if not candidate_ys:
            return []

        # Cluster nearby values (double lines, band edges near rules, etc.)
        candidate_ys.sort()
        clusters: list[list[float]] = [[candidate_ys[0]]]
        for y in candidate_ys[1:]:
            if y - clusters[-1][-1] <= 10:
                clusters[-1].append(y)
            else:
                clusters.append([y])

        return [sum(c) / len(c) for c in clusters]

    def _find_background_bands(
        self,
        target: Page,
        content_x0: float,
        content_width: float,
        content_y0: float,
        content_y1: float,
    ) -> list[tuple[float, float]]:
        """
        Find horizontal bands of background color (filled rects).

        Multiple rects at the same y-position with the same fill color are
        merged. Only bands that span at least 50% of the content width are
        returned.
        """
        from collections import defaultdict

        # Collect filled rects with meaningful height
        filled = [
            r for r in target.rects
            if r.get("non_stroking_color")
            and r["bottom"] - r["top"] > 5
        ]
        if not filled:
            return []

        # Group by y-position and fill color
        # Key: (rounded top, rounded bottom, color tuple)
        bands: dict[tuple, list[dict]] = defaultdict(list)
        for r in filled:
            color = r["non_stroking_color"]
            if isinstance(color, (list, tuple)):
                color = tuple(round(c, 2) for c in color)
            key = (round(r["top"], 1), round(r["bottom"], 1), color)
            bands[key].append(r)

        result: list[tuple[float, float]] = []
        for (top, bottom, color), rects in bands.items():
            # Check if the combined rects span enough width
            combined_width = sum(r["x1"] - r["x0"] for r in rects)
            if combined_width / content_width < self.rule_coverage_threshold:
                continue
            # Must be within content range
            if top < content_y0 - 5 or bottom > content_y1 + 5:
                continue
            result.append((top, bottom))

        result.sort()
        return result

    def _build_sub_regions(
        self,
        split_ys: list[float],
        content_y0: float,
        content_y1: float,
    ) -> list[tuple[float, float]]:
        """Build (top, bottom) bounds for each sub-region between separators."""
        if not split_ys:
            return [(content_y0, content_y1)]

        regions: list[tuple[float, float]] = []
        boundaries = [content_y0] + split_ys + [content_y1]

        for i in range(len(boundaries) - 1):
            top = boundaries[i]
            bottom = boundaries[i + 1]
            if bottom - top > self.y_tolerance:
                regions.append((top, bottom))

        return regions

    # ── Header merging ───────────────────────────────────────────────

    def _merge_header_tables(
        self,
        tables: list[SpatialTable],
        max_header_rows: int = 3,
    ) -> list[SpatialTable]:
        """
        Merge small header-like sub-tables into the following data table.

        Multi-line column headers (e.g., "2025" on one row and "Budget" on the
        next) often end up as their own sub-table when separators split them
        from the data rows. This detects such tables (few rows, no numeric
        data) and folds them into the next table as combined header text.

        When headers are merged, the header words are used to re-detect
        columns (with a lower gap threshold), producing more accurate column
        boundaries. Subsequent headerless tables with similar x-extent inherit
        the same column structure.

        Args:
            tables: List of sub-tables in document order.
            max_header_rows: Maximum number of rows for a table to be
                considered a header block.
        """
        if len(tables) < 2:
            return tables

        merged: list[SpatialTable] = []
        pending_header_tables: list[SpatialTable] = []
        # Track the most recent header-derived column structure for propagation
        propagated_columns: list[SpatialColumn] | None = None
        propagated_headers: list[str] | None = None
        propagated_x_extent: tuple[float, float] | None = None

        for table in tables:
            if self._is_header_table(table, max_header_rows):
                pending_header_tables.append(table)
            else:
                if pending_header_tables:
                    # Re-detect columns using header-derived separators
                    header_seps = self._extract_header_separators(
                        pending_header_tables,
                    )
                    if header_seps:
                        new_columns = self._rebuild_columns_with_header_seps(
                            table, header_seps,
                        )
                        table.columns = new_columns
                        # Re-assign cells with new columns
                        row_groups = self._cluster_rows(table._words)
                        table.rows = self._assign_cells(row_groups, new_columns)

                    # Combine header text using the (possibly updated) columns
                    table.headers = self._combine_header_rows(
                        pending_header_tables, table.columns,
                    )

                    if header_seps:
                        # Remove columns empty in BOTH header and data.
                        # Columns with header text (e.g., "Rate/ Grade") are
                        # preserved even when all data rows are empty.
                        table.columns, table.rows, table.headers = (
                            self._remove_empty_columns_with_headers(
                                table.columns, table.rows, table.headers,
                            )
                        )

                    # Expand data table bbox to include header region
                    if table.bbox and pending_header_tables[0].bbox:
                        hdr_bbox = pending_header_tables[0].bbox
                        table.bbox = (
                            min(table.bbox[0], hdr_bbox[0]),
                            hdr_bbox[1],
                            max(table.bbox[2], hdr_bbox[2]),
                            table.bbox[3],
                        )

                    # Save for propagation to subsequent headerless tables
                    propagated_columns = table.columns
                    propagated_headers = table.headers
                    propagated_x_extent = (
                        min(c.x0 for c in table.columns),
                        max(c.x1 for c in table.columns),
                    )

                    pending_header_tables = []

                elif propagated_columns and propagated_headers is not None and propagated_x_extent:
                    # Check if this headerless table shares similar x-extent
                    # with the header-bearing table — if so, apply same
                    # columns and headers. Do NOT remove empty columns here:
                    # the propagated structure is the source of truth, and
                    # empty columns (e.g., Rate/Hours in summary rows) are
                    # intentionally part of the schema.
                    t_x0 = min(c.x0 for c in table.columns)
                    t_x1 = max(c.x1 for c in table.columns)
                    p_x0, p_x1 = propagated_x_extent
                    natural_col_count = len(table.columns)
                    propagated_col_count = len(propagated_columns)
                    # Similar extent and column count: the table's natural
                    # columns must be at least 50% of the propagated count,
                    # otherwise it's a different structure (e.g., an
                    # allocation table or footnote block).
                    col_ratio_ok = natural_col_count >= propagated_col_count * 0.5
                    tolerance: float = _PROPAGATION_EXTENT_TOLERANCE
                    extent_ok = abs(t_x0 - p_x0) < tolerance and abs(t_x1 - p_x1) < tolerance
                    # A narrower block inside the propagated extent (e.g. a
                    # subtotal row without the trailing CAGR column) is left
                    # as-is but does not end the propagation for tables below.
                    within_extent: bool = t_x0 > p_x0 - tolerance and t_x1 < p_x1 + tolerance
                    if extent_ok and col_ratio_ok:
                        table.columns = propagated_columns
                        table.headers = propagated_headers
                        row_groups = self._cluster_rows(table._words)
                        table.rows = self._assign_cells(row_groups, propagated_columns)
                    elif not within_extent:
                        # Different section — stop propagating
                        propagated_columns = None
                        propagated_headers = None
                        propagated_x_extent = None

                merged.append(table)

        for ht in pending_header_tables:
            merged.append(ht)

        return merged

    @staticmethod
    def _is_summary_only_table(table: SpatialTable) -> bool:
        """
        Check if a table contains only summary/total rows.

        A summary-only table has all first-cell values starting with
        keywords like "Total" or "Vacancy", indicating it is a
        continuation of the preceding table's totals rather than a
        new section with detail rows.
        """
        summary_prefixes = ("Total", "Vacancy", "Temporary")
        if not table.rows:
            return False
        for row in table.rows:
            first_cell = row.cells[0] if row.cells else ""
            if not any(first_cell.startswith(p) for p in summary_prefixes):
                return False
        return True

    @staticmethod
    def _has_numeric_values(table: SpatialTable) -> bool:
        """True if any non-label cell of the table contains a digit."""
        return any(
            any(ch.isdigit() for ch in cell)
            for row in table.rows for cell in row.cells[1:]
        )

    @staticmethod
    def _words_within_columns(words: list[dict], columns: list[SpatialColumn]) -> bool:
        """True if no word starts left of the first column (allowing a small tolerance)."""
        if not columns:
            return False
        left_edge: float = min(c.x0 for c in columns) - _RESLOT_EXTENT_TOLERANCE
        return all(w["x0"] >= left_edge for w in words)

    def _merge_continuation_tables(
        self,
        tables: list[SpatialTable],
        bg_bands: list[tuple[float, float]],
    ) -> list[SpatialTable]:
        """
        Merge a summary-only sub-table into the preceding data table.

        Personnel pages often have a detail table followed by a summary
        section (Total Full-Time Permanent Positions, Vacancy Allowance,
        Total Full-Time Positions and Net Salaries) separated by a
        horizontal rule. These are logically one table.

        A table is merged only when:
        1. It shares the same headers as the preceding table.
        2. No background-colored band separates them (bands indicate
           section breaks, as on Grants pages).
        3. Every row in the candidate table is a summary/total row
           (no position-detail rows).

        Args:
            tables: List of sub-tables after header merging.
            bg_bands: List of (top, bottom) y-positions for colored bands
                on this page.
        """
        if len(tables) < 2:
            return tables

        merged: list[SpatialTable] = []
        i = 0

        while i < len(tables):
            current = tables[i]

            # Try to merge subsequent summary-only tables into current
            while i + 1 < len(tables):
                next_table = tables[i + 1]

                # Must have the same headers — or be a headerless block of
                # totals (split off by a rule) that takes the table's columns.
                headerless_totals: bool = (
                    not next_table.headers and self._has_numeric_values(next_table)
                )
                if current.headers != next_table.headers and not headerless_totals:
                    break
                if not current.headers and not headerless_totals:
                    break

                # Only merge if the next table is summary-only
                if not self._is_summary_only_table(next_table):
                    break

                # Check for a colored band separating the two tables. A band
                # qualifies if its top edge falls inside the inter-table gap —
                # bands that wrap the next table's row (band starts in the gap
                # but extends past it) still indicate a visual section break.
                gap_top = current.bbox[3]   # bottom of current
                gap_bottom = next_table.bbox[1]  # top of next
                has_band_between = any(
                    gap_top - 5 <= band_top <= gap_bottom + 5
                    for band_top, _band_bottom in bg_bands
                )
                if has_band_between:
                    break

                # A headerless summary block has no columns of its own worth
                # keeping (its values may sit too close to split); re-slot its
                # words into the continuation table's columns.
                if headerless_totals and not self._columns_match(current.columns, next_table.columns):
                    # Words left of every column would be dropped (e.g. the
                    # labels under a table that has no title column).
                    if not self._words_within_columns(next_table._words, current.columns):
                        break
                    next_table.rows = self._assign_cells(
                        self._cluster_rows(next_table._words), current.columns,
                    )

                # Merge: append next_table's rows and words into current
                current.rows.extend(next_table.rows)
                current._words.extend(next_table._words)
                # Expand bbox
                current.bbox = (
                    min(current.bbox[0], next_table.bbox[0]),
                    current.bbox[1],
                    max(current.bbox[2], next_table.bbox[2]),
                    next_table.bbox[3],
                )
                i += 1

            merged.append(current)
            i += 1

        return merged

    def _extract_internal_headers(self, table: SpatialTable) -> None:
        """
        Detect and extract header rows from within a table.

        If the first N rows (up to 3) of a table are non-numeric text that
        looks like column labels, promote them to headers and remove them
        from the data rows. The header text is combined per-column across
        the multi-line header rows.

        Modifies the table in place.
        """
        import re

        if not table.rows or len(table.rows) < 2:
            return

        # Find how many leading rows are header-like
        header_count = 0
        for row in table.rows:
            if header_count >= 3:
                break

            non_empty_cells = [c for c in row.cells if c.strip()]
            if not non_empty_cells:
                break

            # Check if this row has data values (comma numbers, percentages,
            # dashes used as zero, dollar amounts)
            has_data = False
            for cell in non_empty_cells:
                cell = cell.strip()
                if re.match(r'^[\d,]+$', cell) and ',' in cell:
                    has_data = True
                    break
                if re.match(r'^\([\d,]+\)$', cell):
                    has_data = True
                    break
                if re.match(r'^[\d.]+%$', cell) or cell == '—%':
                    has_data = True
                    break
                # Decimal numbers (e.g., hourly rates like 39.33)
                if re.match(r'^\d+\.\d+$', cell):
                    has_data = True
                    break

            if has_data:
                break

            header_count += 1

        if header_count == 0:
            return

        # Verify: if a supposed header row has cell values that repeat in
        # the data rows, it's actually data, not a continuation header.
        # E.g., "DOMI" appearing in both a header row and data rows means
        # the header went too far.  Check from the last header row backward,
        # continuing to reduce header_count for each row with repeats.
        data_rows_below = table.rows[header_count:header_count + 10]
        if data_rows_below:
            for hdr_idx in range(header_count - 1, 0, -1):
                hdr_row = table.rows[hdr_idx]
                found_repeat = False
                for col_idx, cell in enumerate(hdr_row.cells):
                    cell_val = cell.strip()
                    if not cell_val:
                        continue
                    for drow in data_rows_below:
                        if (col_idx < len(drow.cells)
                                and drow.cells[col_idx].strip() == cell_val):
                            found_repeat = True
                            break
                    if found_repeat:
                        break
                if found_repeat:
                    header_count = hdr_idx
                else:
                    # No repeats found in this row — stop checking
                    break

        if header_count == 0:
            return

        # Combine the header rows into a single header list per column
        header_rows = table.rows[:header_count]
        headers: list[str] = []
        for col_idx in range(len(table.columns)):
            parts: list[str] = []
            for row in header_rows:
                if col_idx < len(row.cells) and row.cells[col_idx].strip():
                    parts.append(row.cells[col_idx].strip())
            headers.append(" ".join(parts))

        table.headers = headers
        table.rows = table.rows[header_count:]

    def _merge_group_headers(self, table: SpatialTable) -> None:
        """
        Merge hierarchical group headers with sub-column headers using "|".

        Detects when table.headers contains sparse group labels (e.g., "Grade")
        and the first data row(s) contain per-column labels (e.g., "A", "B").
        Produces merged headers like "Grade|A", "Grade|B", etc.

        Group header spans are determined by label-type similarity: a group
        expands rightward through columns whose sub-header labels are the same
        type (e.g., single characters) and stops when encountering a different
        type (e.g., a multi-character word like "Step").
        """
        import re

        if not table.headers or not table.rows:
            return

        # Check if headers are sparse (group-level) — most cells empty
        non_empty_header_count = sum(
            1 for h in table.headers if h.strip()
        )
        total_cols = len(table.headers)
        if non_empty_header_count == 0 or non_empty_header_count >= total_cols * 0.5:
            return  # Not a sparse group header pattern

        # Check if first data row(s) are sub-header-like (non-numeric, dense)
        sub_header_count = 0
        for row in table.rows:
            if sub_header_count >= 2:
                break
            non_empty_cells = [c for c in row.cells if c.strip()]
            if not non_empty_cells:
                break
            # Must be denser than the header row
            if len(non_empty_cells) <= non_empty_header_count:
                break
            has_data = False
            for cell in non_empty_cells:
                cell_text = cell.strip()
                if re.match(r'^[\d,]+$', cell_text) and ',' in cell_text:
                    has_data = True
                    break
                if re.match(r'^\([\d,]+\)$', cell_text):
                    has_data = True
                    break
                if re.match(r'^[\d.]+%$', cell_text) or cell_text == '—%':
                    has_data = True
                    break
            if has_data:
                break
            sub_header_count += 1

        if sub_header_count == 0:
            return

        # Collect sub-header text per column
        sub_rows = table.rows[:sub_header_count]
        sub_labels: list[str] = []
        for col_idx in range(total_cols):
            parts: list[str] = []
            for row in sub_rows:
                if col_idx < len(row.cells) and row.cells[col_idx].strip():
                    parts.append(row.cells[col_idx].strip())
            sub_labels.append(" ".join(parts))

        # Classify each sub-label type for span detection
        def _label_type(text: str) -> str:
            """Classify a sub-header label for group-span detection."""
            text = text.strip()
            if not text:
                return "empty"
            if len(text) == 1 and text.isalpha():
                return "single_letter"
            if re.match(r'^\d+$', text):
                return "number"
            return "word"

        # Determine group header spans using label-type similarity
        # Each non-empty header expands right through empty header cells
        # as long as sub-labels share the same type as the first sub-label
        # in the group.
        group_for_col: list[str] = [""] * total_cols
        i = 0
        while i < total_cols:
            group_text = table.headers[i].strip()
            if group_text:
                # Start a new group span
                group_for_col[i] = group_text
                first_sub_type = _label_type(sub_labels[i])
                j = i + 1
                while j < total_cols:
                    if table.headers[j].strip():
                        break  # Next group header starts
                    sub_type = _label_type(sub_labels[j])
                    if sub_type == "empty" or sub_type == first_sub_type:
                        group_for_col[j] = group_text
                        j += 1
                    else:
                        break  # Different label type — end of group span
                i = j
            else:
                i += 1

        # Build merged headers
        merged: list[str] = []
        for col_idx in range(total_cols):
            group = group_for_col[col_idx]
            sub = sub_labels[col_idx]
            if group and sub:
                merged.append(f"{group}|{sub}")
            elif sub:
                merged.append(sub)
            elif group:
                merged.append(group)
            else:
                merged.append("")

        table.headers = merged
        table.rows = table.rows[sub_header_count:]

    def _split_known_merged_columns(self, table: SpatialTable) -> None:
        """Split columns whose data contains known merged-column patterns.

        Detects merges via two strategies:
        1. Header contains "Decrease" + "Change" (Increase/(Decrease) + % Change)
        2. Last column data consistently has "value  percentage" pattern

        When pdfplumber's x_tolerance merges adjacent values into a single
        word token, the split point is estimated from text character positions
        as a fallback.

        Modifies the table in place.
        """
        import re

        if not table.headers or not table._words:
            return

        split_col_idx: int | None = None
        new_headers: tuple[str, str] | None = None

        # --- Strategy 1: Header contains "Decrease" + "Change" ---
        for col_idx, header in enumerate(table.headers):
            if (re.search(r'Decrease', header, re.IGNORECASE)
                    and re.search(r'Change', header, re.IGNORECASE)):
                split_col_idx = col_idx
                new_headers = ("Increase/ (Decrease)", "% Change")
                break

        # --- Strategy 2: Last column data has "value  percentage" pattern ---
        if split_col_idx is None:
            last_idx = len(table.columns) - 1
            if last_idx > 0 and len(table.rows) >= 1:
                pct_merge = re.compile(
                    r'[\(]?[\d,]+\.?\d*[\)]?\s{2,}[\(]?[\d.]+[\)]?%'
                    r'|[\(]?[\d,]+\.?\d*[\)]?\s{2,}—%'
                    r'|—\s{2,}[\(]?[\d.]+[\)]?%'
                    r'|—\s{2,}—%'
                )
                matches = sum(
                    1 for row in table.rows
                    if last_idx < len(row.cells)
                    and pct_merge.search(row.cells[last_idx])
                )
                if matches >= min(2, len(table.rows)):
                    split_col_idx = last_idx
                    # Split header text intelligently
                    header = (table.headers[last_idx]
                              if last_idx < len(table.headers) else "")
                    if (re.search(r'Decrease', header, re.IGNORECASE)
                            or re.search(r'Change', header, re.IGNORECASE)):
                        new_headers = ("Increase/ (Decrease)", "% Change")
                    elif header:
                        # e.g., "2030 CAGR*" → ("2030", "CAGR*")
                        # e.g., "2024 Actual CAGR*" → ("2024 Actual", "CAGR*")
                        parts = header.rsplit(None, 1)
                        if len(parts) == 2:
                            new_headers = (parts[0], parts[1])
                        else:
                            new_headers = (header, "")
                    else:
                        new_headers = ("Increase/ (Decrease)", "% Change")

        # --- Strategy 3: Header is two merged years (e.g., "2028 2029") ---
        if split_col_idx is None:
            for col_idx, header in enumerate(table.headers):
                m = re.fullmatch(r'(\d{4})\s+(\d{4})', header.strip())
                if m:
                    split_col_idx = col_idx
                    new_headers = (m.group(1), m.group(2))
                    break

        if split_col_idx is None:
            return

        col = table.columns[split_col_idx]

        # --- Find the split point ---
        # Method 1: Word-level gaps between separate tokens.
        # Use center-point inclusion to capture words that start slightly
        # before the column due to keep_blank_chars whitespace.
        # Take only the first (leftmost) gap per row to avoid mixing gaps
        # between different column pairs (e.g., 2028/2029 vs 2029/2030).
        gaps: list[float] = []
        for row in table.rows:
            row_words = sorted(
                (w for w in table._words
                 if self._word_in_column(w, col.x0, col.x1)
                 and abs(w["top"] - row.y0) < self.y_tolerance * 2
                 and w["text"].strip()),
                key=lambda w: w["x0"],
            )
            if len(row_words) >= 2:
                for i in range(len(row_words) - 1):
                    gap = row_words[i + 1]["x0"] - row_words[i]["x1"]
                    if gap > 3:
                        gaps.append(
                            (row_words[i]["x1"] + row_words[i + 1]["x0"]) / 2
                        )
                        break  # only first gap per row

        if gaps:
            gaps.sort()
            split_x: float = gaps[len(gaps) // 2]
        else:
            # Method 2: Estimate from text content of merged word tokens.
            # When pdfplumber merges "value  pct%" into one token, find the
            # internal space and estimate x position proportionally.
            split_x_est = self._estimate_split_x_from_text(table, col)
            if split_x_est is None:
                return
            split_x = split_x_est

        # --- Perform the column split ---
        old_col = table.columns[split_col_idx]
        left_col = SpatialColumn(
            x0=old_col.x0, x1=split_x, alignment=old_col.alignment,
        )
        right_col = SpatialColumn(
            x0=split_x, x1=old_col.x1, alignment=old_col.alignment,
        )
        table.columns = (
            table.columns[:split_col_idx]
            + [left_col, right_col]
            + table.columns[split_col_idx + 1:]
        )

        table.headers = (
            table.headers[:split_col_idx]
            + [new_headers[0], new_headers[1]]
            + table.headers[split_col_idx + 1:]
        )

        # Re-assign cells for all rows by distributing words.
        # Use center-point inclusion to capture words that start slightly
        # before the column due to keep_blank_chars whitespace.
        for row in table.rows:
            row_words = [
                w for w in table._words
                if self._word_in_column(w, old_col.x0, old_col.x1)
                and abs(w["top"] - row.y0) < self.y_tolerance * 2
                and w["text"].strip()
            ]
            # Split word tokens that straddle the split boundary
            split_words = self._split_straddling_words(
                row_words, [left_col, right_col],
            )
            left_parts = [
                w["text"].strip() for w in sorted(split_words, key=lambda w: w["x0"])
                if self._word_in_column(w, left_col.x0, left_col.x1)
            ]
            right_parts = [
                w["text"].strip() for w in sorted(split_words, key=lambda w: w["x0"])
                if self._word_in_column(w, right_col.x0, right_col.x1)
            ]
            left_cell = " ".join(left_parts)
            right_cell = " ".join(right_parts)

            row.cells = (
                row.cells[:split_col_idx]
                + [left_cell, right_cell]
                + row.cells[split_col_idx + 1:]
            )

    def _estimate_split_x_from_text(
        self,
        table: 'SpatialTable',
        col: SpatialColumn,
    ) -> float | None:
        """Estimate a column split x-position from merged word token text.

        When pdfplumber merges two values into one token (e.g., "593,167  1.3%"),
        find the internal separator space and estimate its x position from the
        token's character-to-pixel ratio.
        """
        import re
        # Match "value  percentage" or "value  —%" etc.
        sep_pat = re.compile(
            r'([\(]?[\d,]+\.?\d*[\)]?|—)'
            r'\s+'
            r'([\(]?[\d.]+[\)]?%|—%|n/a)'
        )
        estimated_xs: list[float] = []
        for row in table.rows:
            row_words = [
                w for w in table._words
                if col.x0 <= w["x0"] <= col.x1
                and abs(w["top"] - row.y0) < self.y_tolerance * 2
                and w["text"].strip()
            ]
            for w in row_words:
                m = sep_pat.search(w["text"])
                if m:
                    # Split position: end of the value part (group 1)
                    sep_pos = m.end(1)
                    text_len = len(w["text"])
                    if text_len > 0:
                        frac = sep_pos / text_len
                        est_x = w["x0"] + frac * (w["x1"] - w["x0"])
                        estimated_xs.append(est_x)
        if estimated_xs:
            estimated_xs.sort()
            return estimated_xs[len(estimated_xs) // 2]
        return None

    def _split_merged_fte_rate(self, table: SpatialTable) -> None:
        """Split columns where FTE dash and Rate value are merged.

        Part-time/seasonal tables sometimes have tight spacing between the
        FTE column (which shows '—' for part-time workers) and the Rate/Grade
        column (e.g., '50.50'). When the gap is below column_gap_threshold,
        they end up as a single column with cells like '—  50.50'.

        Detects this pattern and splits the column using word-level gaps.
        """
        import re

        if not table._words or len(table.columns) < 3:
            return

        # Pattern: dash followed by whitespace and a number
        fte_rate_pat = re.compile(r'^—\s{2,}[\d.]+$')

        # Find columns with this pattern
        for col_idx in range(len(table.columns)):
            matches = sum(
                1 for row in table.rows
                if col_idx < len(row.cells)
                and fte_rate_pat.match(row.cells[col_idx].strip())
            )
            if matches < 2:
                continue

            col = table.columns[col_idx]

            # Find split point from word gaps within this column
            gaps: list[float] = []
            for row in table.rows:
                row_words = sorted(
                    (w for w in table._words
                     if self._word_in_column(w, col.x0, col.x1)
                     and abs(w["top"] - row.y0) < self.y_tolerance * 2
                     and w["text"].strip()),
                    key=lambda w: w["x0"],
                )
                if len(row_words) >= 2:
                    for i in range(len(row_words) - 1):
                        gap = row_words[i + 1]["x0"] - row_words[i]["x1"]
                        if gap > 3:
                            gaps.append(
                                (row_words[i]["x1"] + row_words[i + 1]["x0"]) / 2
                            )
                            break

            if not gaps:
                continue

            gaps.sort()
            split_x = gaps[len(gaps) // 2]

            # Perform the split
            left_col = SpatialColumn(x0=col.x0, x1=split_x, alignment="right")
            right_col = SpatialColumn(x0=split_x, x1=col.x1, alignment="left")
            table.columns = (
                table.columns[:col_idx]
                + [left_col, right_col]
                + table.columns[col_idx + 1:]
            )

            # Update headers if present
            if table.headers and col_idx < len(table.headers):
                old_header = table.headers[col_idx]
                table.headers = (
                    table.headers[:col_idx]
                    + [old_header, ""]
                    + table.headers[col_idx + 1:]
                )

            # Re-assign cells for all rows
            for row in table.rows:
                row_words = [
                    w for w in table._words
                    if self._word_in_column(w, col.x0, col.x1)
                    and abs(w["top"] - row.y0) < self.y_tolerance * 2
                    and w["text"].strip()
                ]
                left_words = [w for w in row_words if self._word_in_column(w, left_col.x0, left_col.x1)]
                right_words = [w for w in row_words if self._word_in_column(w, right_col.x0, right_col.x1)]
                left_text = " ".join(w["text"].strip() for w in sorted(left_words, key=lambda w: w["x0"]))
                right_text = " ".join(w["text"].strip() for w in sorted(right_words, key=lambda w: w["x0"]))
                row.cells = (
                    row.cells[:col_idx]
                    + [left_text, right_text]
                    + row.cells[col_idx + 1:]
                )

            # After splitting one column, indices shift — restart scan
            return self._split_merged_fte_rate(table)

    def _fix_merged_rate_hours_boundary(self, table: SpatialTable) -> None:
        """Adjust column boundary where Rate/Grade + Hours/Months are merged.

        When tight spacing merges the multi-line headers "Rate/Grade" and
        "Hours/Months" into a single column header like "Rate/ Hours/ Grade
        Months", the column boundary ends up too far right for hourly workers.
        This detects the pattern, finds the correct boundary from data gaps,
        and adjusts the boundary between the merged column and its neighbor.

        Modifies the table in place.
        """
        import re

        if not table.headers or not table._words:
            return

        for col_idx, header in enumerate(table.headers):
            # Detect merged "Rate/Grade" + "Hours/Months" header.
            # The multi-line merge interleaves: "Rate/ Hours/ Grade Months"
            if not (re.search(r'Rate', header, re.IGNORECASE)
                    and re.search(r'Hours', header, re.IGNORECASE)
                    and re.search(r'Grade', header, re.IGNORECASE)):
                continue

            # Must have a following column to adjust boundary with
            if col_idx + 1 >= len(table.columns):
                continue

            col = table.columns[col_idx]
            next_col = table.columns[col_idx + 1]

            # Find the gap between rate and hours values within this column.
            # For salaried: "32G" then gap then (nothing — hours in next col)
            # For hourly: "24.47" then gap then "2,080"
            # Also look for gaps in the next column's words.
            gap_xs: list[float] = []
            for row in table.rows:
                # Collect words from both the merged col and the next col
                both_words = sorted(
                    (w for w in table._words
                     if col.x0 <= w["x0"] <= next_col.x1
                     and abs(w["top"] - row.y0) < self.y_tolerance * 2
                     and w["text"].strip()
                     and w["text"].strip() not in ("$", "")),
                    key=lambda w: w["x0"],
                )
                if len(both_words) >= 2:
                    # Find the largest gap between consecutive words
                    best_gap = 0.0
                    best_mid = 0.0
                    for i in range(len(both_words) - 1):
                        gap = both_words[i + 1]["x0"] - both_words[i]["x1"]
                        if gap > best_gap:
                            best_gap = gap
                            best_mid = (both_words[i]["x1"]
                                        + both_words[i + 1]["x0"]) / 2
                    if best_gap > 5:
                        gap_xs.append(best_mid)

            if not gap_xs:
                continue

            # Use the median gap as the new boundary position
            gap_xs.sort()
            new_boundary: float = gap_xs[len(gap_xs) // 2]

            # Only adjust if the new boundary moves the split leftward
            # (more restrictive Rate column)
            old_boundary = col.x1
            if new_boundary >= old_boundary:
                continue

            # Adjust the boundary
            table.columns[col_idx] = SpatialColumn(
                x0=col.x0, x1=new_boundary, alignment=col.alignment,
            )
            table.columns[col_idx + 1] = SpatialColumn(
                x0=new_boundary, x1=next_col.x1, alignment=next_col.alignment,
            )

            # Fix headers
            table.headers[col_idx] = "Rate/ Grade"
            if col_idx + 1 < len(table.headers):
                table.headers[col_idx + 1] = "Hours/ Months"

            # Re-assign cells for all rows across both columns
            left_col = table.columns[col_idx]
            right_col = table.columns[col_idx + 1]
            for row in table.rows:
                row_words = [
                    w for w in table._words
                    if self._word_in_column(w, left_col.x0, right_col.x1)
                    and abs(w["top"] - row.y0) < self.y_tolerance * 2
                    and w["text"].strip()
                ]
                split_words = self._split_straddling_words(
                    row_words, [left_col, right_col],
                )

                left_parts = [
                    w["text"].strip()
                    for w in sorted(split_words, key=lambda w: w["x0"])
                    if self._word_in_column(w, left_col.x0, left_col.x1)
                    and w["text"].strip() not in ("$", "")
                ]
                right_parts = [
                    w["text"].strip()
                    for w in sorted(split_words, key=lambda w: w["x0"])
                    if self._word_in_column(w, right_col.x0, right_col.x1)
                    and w["text"].strip() not in ("$", "")
                ]

                row.cells[col_idx] = " ".join(left_parts)
                if col_idx + 1 < len(row.cells):
                    row.cells[col_idx + 1] = " ".join(right_parts)

            # Only process one fix per table
            break

    def _extract_header_separators(
        self,
        header_tables: list[SpatialTable],
        header_gap_threshold: float = 5.0,
    ) -> list[float]:
        """
        Extract column separator positions from header words.

        Uses a lower gap threshold than normal column detection, since header
        text is often denser (e.g., "Grade" and "Months" may be only 6pt apart
        but are clearly separate columns).
        """
        all_words: list[dict] = []
        for ht in header_tables:
            all_words.extend(ht._words)

        if not all_words:
            return []

        rows = self._cluster_rows(all_words)
        if not rows:
            return []

        # Collect gap midpoints from header rows using low threshold
        all_gap_positions: list[float] = []
        for row in rows:
            if len(row) < 2:
                continue
            for i in range(len(row) - 1):
                gap = row[i + 1]["x0"] - row[i]["x1"]
                if gap >= header_gap_threshold:
                    gap_mid = (row[i]["x1"] + row[i + 1]["x0"]) / 2
                    all_gap_positions.append(gap_mid)

        if not all_gap_positions:
            return []

        # Cluster nearby gap positions
        clusters = self._cluster_gap_positions(
            sorted(all_gap_positions), self.column_gap_threshold,
        )

        # Accept any cluster that appears in at least one header row
        return [center for center, count in clusters if count >= 1]

    def _rebuild_columns_with_header_seps(
        self,
        table: SpatialTable,
        header_seps: list[float],
    ) -> list[SpatialColumn]:
        """
        Re-detect columns for a data table, using header-derived separators
        as additional column hints (add-only, never replacing existing ones).
        The table's original dollar separators are preserved.
        """
        words = table._words
        if not words:
            return table.columns

        row_groups = self._cluster_rows(words)

        columns = self._detect_columns(
            words,
            row_groups,
            dollar_separators=table._dollar_separators,
            header_separators=header_seps,
        )
        return columns

    def _is_header_table(self, table: SpatialTable, max_rows: int) -> bool:
        """
        Determine if a table looks like a header block rather than data.

        Criteria:
        - Has few rows (≤ max_rows)
        - Rows are mostly non-numeric text (column names, years, labels)
        """
        if len(table.rows) > max_rows:
            return False
        if not table.rows:
            return False

        # Section title rows (e.g., "Position Summary: Grant Name") should
        # not be treated as headers — they're standalone section labels.
        first_row_text = " ".join(c.strip() for c in table.rows[0].cells if c.strip())
        if "Position Summary:" in first_row_text:
            return False

        # Count cells that look like data (contain comma-separated numbers
        # or are purely numeric with 4+ digits — but not 4-digit years)
        import re
        data_cell_count = 0
        total_cells = 0
        for row in table.rows:
            for cell in row.cells:
                cell = cell.strip()
                if not cell:
                    continue
                total_cells += 1
                # Comma-formatted numbers like "1,779,292" or "185,381.3"
                if re.match(r'^[\d,]+\.?\d*$', cell) and ',' in cell:
                    data_cell_count += 1
                # Parenthesized negative numbers like "(50,000)" or "(66.5)%"
                elif re.match(r'^\([\d,.]+\)%?$', cell):
                    data_cell_count += 1
                # Dollar-prefixed values like "$ 1,065,571"
                elif re.match(r'^\$\s*[\d,.]+$', cell):
                    data_cell_count += 1
                # Decimal numbers like "7.6", "17.48"
                elif re.match(r'^[\d]+\.[\d]+$', cell):
                    data_cell_count += 1
                # Em-dashes used as zero/nil placeholders
                elif cell in ('—', '–', '--'):
                    data_cell_count += 1

        if total_cells == 0:
            return True

        # If less than 25% of non-empty cells look like data, it's a header
        return data_cell_count / total_cells < 0.25

    def _combine_header_rows(
        self,
        header_tables: list[SpatialTable],
        data_columns: list[SpatialColumn],
    ) -> list[str]:
        """
        Combine multi-line header rows into a single header list aligned
        to the data table's column structure.

        Uses raw words from the header tables and assigns each word to the
        nearest data column, then joins vertically per column.
        """
        # Collect all words from header tables
        all_words: list[dict] = []
        for ht in header_tables:
            all_words.extend(ht._words)

        if not all_words:
            return [""] * len(data_columns)

        # Cluster header words into rows
        header_rows = self._cluster_rows(all_words)
        header_rows.sort(key=lambda r: min(w["top"] for w in r))

        # For each row, assign words to the nearest data column
        headers_by_col: dict[int, list[str]] = {i: [] for i in range(len(data_columns))}

        for row_words in header_rows:
            # Track which columns got text from this row
            row_col_text: dict[int, list[str]] = {i: [] for i in range(len(data_columns))}

            for word in sorted(row_words, key=lambda w: w["x0"]):
                col_idx = self._nearest_column(word, data_columns)
                row_col_text[col_idx].append(word["text"].strip())

            for col_idx in range(len(data_columns)):
                text = " ".join(row_col_text[col_idx])
                if text:
                    headers_by_col[col_idx].append(text)

        # Join multi-line parts with space
        return [" ".join(headers_by_col[i]) for i in range(len(data_columns))]

    def _nearest_column(self, word: dict, columns: list[SpatialColumn]) -> int:
        """Find the column index whose range best contains a word's center."""
        word_center = (word["x0"] + word["x1"]) / 2

        # First try: word center falls within a column
        for i, col in enumerate(columns):
            if col.x0 <= word_center <= col.x1:
                return i

        # Fallback: find the nearest column center
        best_idx = 0
        best_dist = float("inf")
        for i, col in enumerate(columns):
            dist = abs(word_center - col.center)
            if dist < best_dist:
                best_dist = dist
                best_idx = i
        return best_idx

    # ── False-positive filtering ───────────────────────────────────

    def _is_real_table(
        self,
        table: SpatialTable,
        min_multi_col_ratio: float = 0.25,
    ) -> bool:
        """
        Determine if a detected table is a real table vs. prose text.

        A real table has most of its rows using multiple columns. Prose text
        blocks that happen to have a few right-aligned items (like a title
        and code on the first two lines) will have very low multi-column
        utilization.

        Args:
            table: The table to evaluate.
            min_multi_col_ratio: Minimum fraction of rows that must have
                content in 2+ columns to be considered a real table.
        """
        if not table.rows:
            return False

        # Single-column tables are not real tables (either a lone value
        # or a block of prose text)
        if len(table.columns) <= 1:
            return False

        multi_col_rows = 0
        for row in table.rows:
            non_empty = sum(1 for cell in row.cells if cell.strip())
            if non_empty >= 2:
                multi_col_rows += 1

        return multi_col_rows / len(table.rows) >= min_multi_col_ratio

    @staticmethod
    def _strip_trailing_chart_labels(table: 'SpatialTable') -> None:
        """Remove trailing rows that follow a large vertical gap.

        Pie chart labels and other non-table content sometimes get captured
        as trailing rows. When there's a gap > 2x the median row spacing
        before a block of rows where none have numeric data, strip them.
        """
        import re

        if len(table.rows) < 4:
            return

        _DATA_RE = re.compile(r'^[\d$,.()\-%—–\s]+$')

        # Compute median row spacing
        spacings = []
        for i in range(1, len(table.rows)):
            gap = table.rows[i].y0 - table.rows[i - 1].y1
            if gap > 0:
                spacings.append(gap)
        if not spacings:
            return
        spacings.sort()
        median_spacing = spacings[len(spacings) // 2]
        large_gap_threshold = max(median_spacing * 2.5, 20.0)

        # Find the last row with numeric data
        last_data_idx = -1
        for i in range(len(table.rows) - 1, -1, -1):
            non_empty = [c.strip() for c in table.rows[i].cells if c.strip()]
            if any(_DATA_RE.match(c) for c in non_empty):
                last_data_idx = i
                break

        if last_data_idx < 0 or last_data_idx >= len(table.rows) - 1:
            return

        # Check if there's a large gap after the last data row
        gap = table.rows[last_data_idx + 1].y0 - table.rows[last_data_idx].y1
        if gap > large_gap_threshold:
            # All rows after the gap are non-data; strip them
            table.rows = table.rows[:last_data_idx + 1]

    @staticmethod
    def _strip_peripheral_captions(table: 'SpatialTable') -> None:
        """Remove trailing rows that are captions/footnotes, not data.

        A trailing row is stripped if it has content in only 1 cell (out of
        3+ columns) and that content is non-numeric text.  This catches
        footer captions like "Deliverables are tentative and are subject to
        change" that align with one column but aren't tabular data.
        """
        import re

        if len(table.columns) < 3 or not table.rows:
            return

        _DATA_RE = re.compile(
            r'^[\d$,.()\-%—–\s]+$'
        )

        while table.rows:
            row = table.rows[-1]
            non_empty = [cell.strip() for cell in row.cells if cell.strip()]
            if len(non_empty) != 1:
                break
            # Keep if the single cell looks like a numeric data value
            if _DATA_RE.match(non_empty[0]):
                break
            table.rows.pop()

    @staticmethod
    def _strip_peripheral_captions_captured(
        table: 'SpatialTable',
    ) -> list['TextBlock']:
        """Strip trailing captions and return them as TextBlock objects."""
        import re

        blocks: list[TextBlock] = []
        if len(table.columns) < 3 or not table.rows:
            return blocks

        _DATA_RE = re.compile(r'^[\d$,.()\-%—–\s]+$')

        while table.rows:
            row = table.rows[-1]
            non_empty = [cell.strip() for cell in row.cells if cell.strip()]
            if len(non_empty) != 1:
                break
            if _DATA_RE.match(non_empty[0]):
                break
            popped = table.rows.pop()
            bbox = (
                table.columns[0].x0, popped.y0,
                table.columns[-1].x1, popped.y1,
            )
            blocks.append(TextBlock(
                text=non_empty[0], bbox=bbox, role="footnote",
            ))
        return blocks

    def _split_tables_at_mid_prose(
        self,
        tables: list['SpatialTable'],
    ) -> list['SpatialTable']:
        """Split tables that contain mid-table prose (footnotes between
        two distinct sections with separate headers).

        Detects a pattern where a table contains:
        1. Data rows (multi-column, possibly with a totals row)
        2. Prose/footnote rows (sparse, long text in 1-2 cells)
        3. A second header row (non-numeric text in 2+ columns)
        4. More data rows

        When found, splits into two tables, discarding the prose rows.
        """
        import re

        _DATA_RE = re.compile(
            r'^[\d$,.()\-%—–\s]+$'
        )

        result: list[SpatialTable] = []
        for table in tables:
            split = self._find_mid_prose_split(table, _DATA_RE)
            if split is None:
                result.append(table)
            else:
                result.extend(split)
        return result

    def _split_tables_at_mid_prose_captured(
        self,
        tables: list['SpatialTable'],
    ) -> tuple[list['SpatialTable'], list['TextBlock']]:
        """Like _split_tables_at_mid_prose, but returns captured prose blocks."""
        import re

        _DATA_RE = re.compile(r'^[\d$,.()\-%—–\s]+$')
        result: list[SpatialTable] = []
        text_blocks: list[TextBlock] = []

        for table in tables:
            split = self._find_mid_prose_split(table, _DATA_RE)
            if split is None:
                result.append(table)
            else:
                # Capture the prose rows that were between the split tables
                split_info = self._find_mid_prose_split_info(table, _DATA_RE)
                if split_info:
                    sparse_start, header_idx = split_info
                    for row in table.rows[sparse_start:header_idx]:
                        text = " ".join(
                            c.strip() for c in row.cells if c.strip()
                        )
                        if text:
                            text_blocks.append(TextBlock(
                                text=text,
                                bbox=(table.columns[0].x0, row.y0,
                                      table.columns[-1].x1, row.y1),
                                role="mid_table_prose",
                            ))
                result.extend(split)
        return result, text_blocks

    def _find_mid_prose_split_info(
        self,
        table: 'SpatialTable',
        data_re: 're.Pattern[str]',
    ) -> tuple[int, int] | None:
        """Return (sparse_start, header_row_idx) for the mid-prose split point."""
        if len(table.columns) < 3 or len(table.rows) < 6:
            return None

        row_types: list[str] = []
        for row in table.rows:
            non_empty = [c.strip() for c in row.cells if c.strip()]
            n_non_empty = len(non_empty)
            if n_non_empty >= 2:
                has_data = any(data_re.match(c) for c in non_empty)
                has_long_text = any(len(c) > 60 for c in non_empty)
                if has_long_text:
                    row_types.append("sparse")
                elif has_data:
                    row_types.append("data")
                else:
                    row_types.append("header-like")
            else:
                row_types.append("sparse")

        in_data = False
        sparse_start = None
        for i, rtype in enumerate(row_types):
            if rtype == "data":
                in_data = True
            elif in_data and rtype == "sparse" and sparse_start is None:
                sparse_start = i
            elif rtype == "header-like" and sparse_start is not None:
                remaining = row_types[i + 1:]
                if any(rt == "data" for rt in remaining):
                    return (sparse_start, i)
            elif rtype == "data" and sparse_start is not None:
                sparse_start = None
        return None

    def _find_mid_prose_split(
        self,
        table: 'SpatialTable',
        data_re: 're.Pattern[str]',
    ) -> list['SpatialTable'] | None:
        """Find a mid-table prose block and return split tables, or None."""
        if len(table.columns) < 3 or len(table.rows) < 6:
            return None

        # Classify each row as "data" (2+ non-empty cells with at least
        # one data value or short label) or "sparse" (0-1 non-empty cells,
        # or all-text with long content suggesting prose).
        row_types: list[str] = []  # "data", "sparse", "header-like"
        for row in table.rows:
            non_empty = [c.strip() for c in row.cells if c.strip()]
            n_non_empty = len(non_empty)

            if n_non_empty >= 2:
                # Check if any cell is a data value
                has_data = any(data_re.match(c) for c in non_empty)
                # Check if any single cell is very long (prose)
                has_long_text = any(len(c) > 60 for c in non_empty)
                if has_long_text:
                    row_types.append("sparse")
                elif has_data:
                    row_types.append("data")
                else:
                    row_types.append("header-like")
            else:
                row_types.append("sparse")

        # Look for a pattern: data+ → sparse+ → header-like → data+
        # Find the first sparse block that follows data rows
        in_data = False
        sparse_start = None
        for i, rtype in enumerate(row_types):
            if rtype == "data":
                in_data = True
            elif in_data and rtype == "sparse" and sparse_start is None:
                sparse_start = i
            elif rtype == "header-like" and sparse_start is not None:
                # Found: data → sparse → header-like
                # Check that more data rows follow
                remaining = row_types[i + 1:]
                if any(rt == "data" for rt in remaining):
                    # Split here: table1 = rows[:sparse_start],
                    # table2 = rows[i:] (header-like row becomes header)
                    return self._do_split(table, sparse_start, i)
            elif rtype == "data" and sparse_start is not None:
                # Data row appeared without a header-like row — reset
                sparse_start = None

        return None

    def _do_split(
        self,
        table: 'SpatialTable',
        sparse_start: int,
        header_row_idx: int,
    ) -> list['SpatialTable']:
        """Split a table at a mid-prose boundary into two tables."""
        from copy import deepcopy

        # Table 1: rows before the prose
        t1 = deepcopy(table)
        t1.rows = table.rows[:sparse_start]

        # Table 2: rows from the header-like row onward
        t2 = deepcopy(table)
        t2.rows = table.rows[header_row_idx:]
        # The header-like row becomes the header of table 2
        if t2.rows:
            t2.headers = [c.strip() for c in t2.rows[0].cells]
            t2.rows = t2.rows[1:]

        result = []
        if t1.rows:
            result.append(t1)
        if t2.rows:
            result.append(t2)
        return result

    # ── Row clustering ──────────────────────────────────────────────

    def _cluster_rows(self, words: list[dict]) -> list[list[dict]]:
        """Group words into rows by y-position clustering."""
        sorted_words = sorted(words, key=lambda w: w["top"])
        rows: list[list[dict]] = []
        current_row: list[dict] = []
        current_y: float = -999

        for word in sorted_words:
            if abs(word["top"] - current_y) <= self.y_tolerance:
                current_row.append(word)
            else:
                if current_row:
                    rows.append(current_row)
                current_row = [word]
                current_y = word["top"]

        if current_row:
            rows.append(current_row)

        for row in rows:
            row.sort(key=lambda w: w["x0"])

        return rows

    @staticmethod
    def _filter_prose_rows(
        row_groups: list[list[dict]],
        region_width: float,
        min_text_len: int = 50,
        min_width_ratio: float = 0.5,
        column_gap_threshold: float = 15.0,
    ) -> tuple[list[list[dict]], list[list[dict]]]:
        """Strip leading and trailing prose/footnote rows from a region.

        **Trailing scan** (bottom-up): A row is considered prose if any
        single word token spans more than ``min_width_ratio`` of the region
        width AND contains more than ``min_text_len`` characters.  Short
        fragment rows (≤2 words, ≤30 chars) adjacent to prose are also
        stripped as likely footnote continuations.

        **Leading scan** (top-down): A row is considered non-tabular if it
        has no inter-word gap ≥ ``column_gap_threshold``.  This catches
        bullet-point lists, section headers, and paragraph text that
        precede a table in the same region.  Stops at the first row with
        a table-like column gap.

        Returns:
            (data_rows, prose_rows) — two disjoint lists preserving order.
        """
        def _is_prose(row: list[dict]) -> bool:
            for word in row:
                token_width = word["x1"] - word["x0"]
                text = word.get("text", "")
                if (
                    token_width > region_width * min_width_ratio
                    and len(text) > min_text_len
                ):
                    return True
            return False

        def _is_short_fragment(row: list[dict]) -> bool:
            total_text = " ".join(w.get("text", "") for w in row)
            return len(row) <= 2 and len(total_text) <= 30

        def _is_non_table_row(row: list[dict]) -> bool:
            """Return True if the row is clearly non-tabular content.

            Detects bullet-point items (starting with '•') and prose lines
            (long text with no large inter-word gaps).  Short labels like
            'Revenues' or 'Personnel' are NOT flagged — they may be valid
            section headers within tables.
            """
            sorted_w = sorted(row, key=lambda w: w["x0"])
            first_text = sorted_w[0].get("text", "").strip() if sorted_w else ""

            # Bullet items are clearly non-tabular
            if first_text.startswith("•"):
                return True

            # Continuous prose: multiple words with no large inter-word gaps
            # and combined text long enough to be a sentence
            if len(sorted_w) >= 2:
                max_gap = max(
                    sorted_w[j + 1]["x0"] - sorted_w[j]["x1"]
                    for j in range(len(sorted_w) - 1)
                )
                total_text = " ".join(w.get("text", "") for w in sorted_w)
                if max_gap < column_gap_threshold and len(total_text) > 40:
                    return True

            # Single long token (existing prose check)
            if _is_prose(row):
                return True

            return False

        # ── Leading scan (top-down) ──
        # Strip rows that are clearly non-tabular (bullet items, prose
        # sentences).  Short section headers like "Revenues" or
        # "Personnel" are kept — they are valid table group labels.
        # Only strip if we find a block of non-table rows; isolated
        # short labels (1-2 words, ≤30 chars) are kept unless adjacent
        # to confirmed non-table rows.
        leading_cutoff = 0
        found_non_table = False
        tentative_leading = 0
        for i, row in enumerate(row_groups):
            if _is_non_table_row(row):
                found_non_table = True
                tentative_leading = i + 1
                leading_cutoff = i + 1
            elif _is_short_fragment(row) and not found_non_table:
                # Short fragment before any non-table row — don't strip yet
                break
            elif _is_short_fragment(row):
                # Short fragment after non-table rows — tentatively strip
                tentative_leading = i + 1
            else:
                break
        if found_non_table:
            leading_cutoff = tentative_leading

        # ── Trailing scan (bottom-up) ──
        # Scan from the end.  Short fragments (e.g., "change.") may appear
        # below or between prose rows as footnote continuations.  We track
        # them tentatively and only strip them if confirmed by a prose row.
        cutoff = len(row_groups)
        tentative_cutoff = len(row_groups)
        found_prose = False
        for i in range(len(row_groups) - 1, -1, -1):
            row = row_groups[i]
            if _is_prose(row):
                found_prose = True
                tentative_cutoff = i
                cutoff = i
            elif _is_short_fragment(row):
                # Tentatively include — will be confirmed if prose above
                tentative_cutoff = i
            else:
                break
        if found_prose:
            cutoff = tentative_cutoff

        # Apply both cutoffs, but don't strip everything
        if leading_cutoff >= cutoff:
            # Both scans overlap — would remove all rows.  Keep them.
            return row_groups, []
        prose_rows = row_groups[:leading_cutoff] + row_groups[cutoff:]
        data_rows = row_groups[leading_cutoff:cutoff]
        if not data_rows:
            return row_groups, []
        return data_rows, prose_rows

    @staticmethod
    def _prose_rows_to_text_blocks(
        prose_rows: list[list[dict]],
        all_rows: list[list[dict]],
        data_rows: list[list[dict]],
    ) -> list['TextBlock']:
        """Convert prose row groups into TextBlock objects with role classification."""
        if not prose_rows or not data_rows:
            return []

        # Determine the y-boundary between leading and trailing prose
        data_y0 = min(w["top"] for row in data_rows for w in row)
        blocks: list[TextBlock] = []

        for row in prose_rows:
            row_words = sorted(row, key=lambda w: w["x0"])
            text = " ".join(w["text"].strip() for w in row_words)
            if not text.strip():
                continue
            row_y = min(w["top"] for w in row_words)
            role = "leading_prose" if row_y < data_y0 else "trailing_prose"
            x0 = min(w["x0"] for w in row_words)
            y0 = min(w["top"] for w in row_words)
            x1 = max(w["x1"] for w in row_words)
            y1 = max(w["bottom"] for w in row_words)
            blocks.append(TextBlock(text=text, bbox=(x0, y0, x1, y1), role=role))

        return blocks

    # ── Column detection ────────────────────────────────────────────

    def _nearest_clear_gap(
        self,
        header_sep: float,
        gap_centers: list[float],
        words: list[dict],
        separators: list[float],
    ) -> Optional[float]:
        """
        Find a clear data channel near a header separator that can stand in for it.

        Candidates are the sub-threshold data-gap centers plus the position
        just before the words the header separator cuts through (tokens are
        often space-padded, so the measured gap center can land on a word's
        edge while a clean channel sits a point to its left). A candidate
        must be corroborated by a data gap within one column-gap threshold,
        cross no word, sit strictly inside the existing separator range
        (splitting a column rather than extending the table), and not
        duplicate an existing separator. Returns the closest one, or None.
        """
        if not separators or not gap_centers:
            return None
        lo, hi = min(separators), max(separators)
        cut_words: list[dict] = [w for w in words if w["x0"] < header_sep < w["x1"]]
        just_before_cut: list[float] = (
            [min(w["x0"] for w in cut_words) - 1.0] if cut_words else []
        )
        candidates: list[float] = [
            c for c in [*gap_centers, *just_before_cut]
            if abs(c - header_sep) < self.column_gap_threshold
            and any(abs(c - g) < self.column_gap_threshold for g in gap_centers)
            and lo < c < hi
            and not any(w["x0"] < c < w["x1"] for w in words)
            and not any(abs(c - s) < self.column_gap_threshold for s in separators)
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda g: abs(g - header_sep))

    def _detect_columns(
        self,
        words: list[dict],
        row_groups: list[list[dict]],
        dollar_separators: Optional[list[float]] = None,
        header_separators: Optional[list[float]] = None,
    ) -> list[SpatialColumn]:
        """
        Detect columns by finding consistent gaps across rows.

        Only gap positions that appear in at least min_gap_frequency of
        multi-word rows are accepted as column separators. This filters out
        anomalous rows (headers, totals, balance lines) that have different
        layouts than the majority of data rows.

        Dollar sign positions (if provided) are used as high-confidence
        separator hints that bypass the frequency filter.

        Header separators (if provided) are added where no existing separator
        is nearby — they introduce new columns but never replace existing ones.
        """
        multi_word_rows = [r for r in row_groups if len(r) >= 2]
        if not multi_word_rows:
            all_x0 = min(w["x0"] for w in words)
            all_x1 = max(w["x1"] for w in words)
            return [SpatialColumn(x0=all_x0, x1=all_x1, alignment="left")]

        # For each row, collect gap midpoints
        all_gap_positions: list[float] = []
        # Also collect sub-threshold gaps for header separator corroboration
        sub_threshold_gaps: list[float] = []

        for row in multi_word_rows:
            for i in range(len(row) - 1):
                gap_start = row[i]["x1"]
                gap_end = row[i + 1]["x0"]
                gap_size = gap_end - gap_start
                if gap_size >= self.column_gap_threshold:
                    gap_mid = (gap_start + gap_end) / 2
                    all_gap_positions.append(gap_mid)
                elif gap_size >= self.column_gap_threshold * 0.4:
                    sub_threshold_gaps.append((gap_start + gap_end) / 2)

        # Cluster all gap positions
        raw_clusters = self._cluster_gap_positions(
            sorted(all_gap_positions), self.column_gap_threshold
        ) if all_gap_positions else []

        # Filter: keep only clusters that appear in enough rows
        min_count = max(1, int(len(multi_word_rows) * self.min_gap_frequency))
        separators: list[float] = []
        for center, count in raw_clusters:
            if count >= min_count:
                separators.append(center)

        # Merge in dollar-sign-derived separators as high-confidence hints.
        # Dollar signs give precise column-start positions. When a dollar
        # separator is near a gap-based one and there are no words between
        # them (i.e., they mark the same boundary), replace the gap-based
        # separator. If words exist between them, they are distinct column
        # boundaries and both are kept.
        if dollar_separators:
            dollar_match_radius = self.column_gap_threshold * 3
            for ds in dollar_separators:
                new_separators: list[float] = []
                for s in separators:
                    if abs(ds - s) >= dollar_match_radius:
                        new_separators.append(s)
                    else:
                        # Check if many words exist between the two seps —
                        # meaning they're distinct column boundaries. A few
                        # stray labels extending into the gap don't count.
                        lo, hi = min(ds, s), max(ds, s)
                        words_between = sum(
                            1 for w in words
                            if lo < (w["x0"] + w["x1"]) / 2 < hi
                        )
                        if words_between >= 3:
                            new_separators.append(s)  # Keep both
                        # else: drop gap-based sep (same boundary)
                separators = new_separators
                separators.append(ds)

        # Merge in header-derived separators (add-only — never replace).
        # These add new column breaks where the header shows distinct columns
        # but data-row gaps are too sparse to pass the frequency filter.
        # A header separator is added when it corroborates any data-row gap:
        # 1. A weak gap cluster (exists but didn't meet frequency threshold),
        # 2. A strong gap cluster (accepted but possibly removed by $ merge),
        # 3. Sub-threshold gaps in the data (gaps too narrow for the main
        #    detector but confirmed by the header's column structure).
        if header_separators:
            header_match_radius = self.column_gap_threshold * 2
            # Weak gap clusters: appeared in data but didn't meet frequency
            # threshold. These are trusted enough to add without range check.
            weak_cluster_centers = [
                center for center, count in raw_clusters
                if 0 < count < min_count
            ] if raw_clusters else []
            # All raw gap cluster centers (including strong ones that may
            # have been removed during dollar-separator merging). These
            # require range check to avoid spurious Title-area splits.
            all_cluster_centers = [
                center for center, count in raw_clusters
                if count > 0
            ] if raw_clusters else []
            # Cluster the sub-threshold gaps
            sub_clusters = self._cluster_gap_positions(
                sorted(sub_threshold_gaps), self.column_gap_threshold
            ) if sub_threshold_gaps else []
            sub_cluster_centers = [center for center, _count in sub_clusters]
            for hs in header_separators:
                # Skip if a separator already exists at essentially the same
                # position (within the column gap threshold — a tighter check
                # than the match radius to avoid skipping splits that fall
                # within a wide merged column).
                if any(abs(hs - s) < self.column_gap_threshold for s in separators):
                    continue
                # Corroborated by a weak data-row gap cluster? These are
                # trusted even outside the main separator range.
                if any(abs(hs - wc) < header_match_radius for wc in weak_cluster_centers):
                    separators.append(hs)
                    continue

                # Check if header sep overlaps a data word. Handle this
                # before the range check because the snap position may fall
                # within the data extent even when the original header sep
                # is beyond the outermost data-derived separator.
                conflicting = [
                    w for w in words if w["x0"] < hs < w["x1"]
                ]
                if conflicting:
                    # Prefer a nearby narrow gap that the data rows share
                    # consistently: the header boundary is slightly offset
                    # from where the data columns actually part (e.g. a
                    # right-aligned FTE count sitting ~6pt left of a rate).
                    data_gap = self._nearest_clear_gap(
                        hs, sub_cluster_centers, words, separators,
                    )
                    if data_gap is not None:
                        separators.append(data_gap)
                        continue
                    # Snap to just before the leftmost conflicting word,
                    # but only if the resulting column (from the nearest
                    # smaller separator to the snap point) would be empty.
                    snap_x = min(w["x0"] for w in conflicting) - 1.0
                    if any(
                        abs(snap_x - s) < self.column_gap_threshold
                        for s in separators
                    ):
                        continue
                    prev_sep = max(
                        (s for s in separators if s < snap_x),
                        default=None,
                    )
                    if prev_sep is not None:
                        col_has_data = any(
                            prev_sep < (w["x0"] + w["x1"]) / 2 < snap_x
                            for w in words
                        )
                        if not col_has_data:
                            separators.append(snap_x)
                    continue

                # For remaining checks, header separators must fall between
                # existing data-derived separators — they split existing
                # columns, not extend the column range. This prevents
                # spurious splits in the Title area.
                if not separators or not (min(separators) < hs < max(separators)):
                    continue
                # Corroborated by any data-row gap cluster (including strong
                # ones that may have been removed by dollar-sep merging)?
                if any(abs(hs - ac) < header_match_radius for ac in all_cluster_centers):
                    separators.append(hs)
                # Corroborated by sub-threshold gaps in the data?
                elif any(abs(hs - sc) < header_match_radius for sc in sub_cluster_centers):
                    separators.append(hs)
                # No data corroboration — the header column is simply
                # empty in the data and no word crosses this position.
                elif not any(w["x0"] < hs < w["x1"] for w in words):
                    separators.append(hs)

        if not separators:
            all_x0 = min(w["x0"] for w in words)
            all_x1 = max(w["x1"] for w in words)
            return [SpatialColumn(x0=all_x0, x1=all_x1, alignment="left")]

        separators.sort()

        # Adjust separators so they never cut through a word. If a separator
        # falls inside any word's [x0, x1] range, nudge it to the nearest
        # gap edge (just left of the word's x0 or just right of its x1).
        separators = self._adjust_separators_to_word_boundaries(separators, words)

        # Build columns from separators
        all_x0 = min(w["x0"] for w in words)
        all_x1 = max(w["x1"] for w in words)

        columns: list[SpatialColumn] = []
        boundaries = [all_x0] + separators + [all_x1]

        for i in range(len(boundaries) - 1):
            col_x0 = boundaries[i]
            col_x1 = boundaries[i + 1]
            alignment = self._detect_column_alignment(words, col_x0, col_x1)
            columns.append(SpatialColumn(x0=col_x0, x1=col_x1, alignment=alignment))

        return columns

    def _adjust_separators_to_word_boundaries(
        self,
        separators: list[float],
        words: list[dict],
    ) -> list[float]:
        """
        Nudge separators that fall inside a word so they don't bisect text.

        For each separator, if it lands within any word's [x0, x1] range,
        move it to whichever side of the word creates a smaller shift
        (just left of x0, or just right of x1), with a 1pt margin.
        """
        adjusted: list[float] = []
        for sep in separators:
            conflicting = [
                w for w in words
                if w["x0"] < sep < w["x1"]
            ]
            if not conflicting:
                adjusted.append(sep)
                continue

            # Find the tightest conflict (word whose edge is closest to sep)
            best_pos = sep
            min_shift = float("inf")
            for w in conflicting:
                shift_left = sep - w["x0"]
                shift_right = w["x1"] - sep
                if shift_left < min_shift:
                    min_shift = shift_left
                    best_pos = w["x0"] - 1.0
                if shift_right < min_shift:
                    min_shift = shift_right
                    best_pos = w["x1"] + 1.0

            adjusted.append(best_pos)

        return adjusted

    def _cluster_gap_positions(
        self, values: list[float], tolerance: float
    ) -> list[tuple[float, int]]:
        """Cluster sorted gap positions. Returns (center, count) for each cluster."""
        if not values:
            return []

        clusters: list[list[float]] = [[values[0]]]
        for v in values[1:]:
            if v - clusters[-1][-1] <= tolerance:
                clusters[-1].append(v)
            else:
                clusters.append([v])

        result: list[tuple[float, int]] = []
        for cluster in clusters:
            cluster.sort()
            center = cluster[len(cluster) // 2]
            result.append((center, len(cluster)))

        return result

    def _detect_column_alignment(
        self, words: list[dict], col_x0: float, col_x1: float
    ) -> str:
        """Detect whether a column is left- or right-aligned."""
        col_words = [
            w for w in words
            if self._word_in_column(w, col_x0, col_x1)
        ]
        if not col_words:
            return "left"

        left_edges = [w["x0"] for w in col_words]
        right_edges = [w["x1"] for w in col_words]

        left_var = _variance(left_edges)
        right_var = _variance(right_edges)

        return "right" if right_var < left_var else "left"

    # ── Cell assignment ─────────────────────────────────────────────

    @staticmethod
    def _split_compound_value_tokens(words: list[dict]) -> list[dict]:
        """Split tokens that pack several column values into one word.

        With keep_blank_chars, pdfplumber bridges tightly spaced values into
        a single token — e.g. a bold total row
        "$ 105,595,349 $ 108,140,401 $ 111,745,836 $" or an amount and a
        percentage "54,790,510   1.2 %". One such token spanning several
        columns erases those column boundaries for the whole table, so split
        it before column detection, using per-character positions.

        Only tokens made entirely of values, '$' and '%' are split. A '$'
        stays attached to the value after it and a '%' to the value before
        it; a trailing lone '$' becomes its own token. Each word's "chars"
        list (from return_chars=True) is dropped from the output.
        """
        result: list[dict] = []
        for w in words:
            base: dict = {k: v for k, v in w.items() if k != "chars"}
            pieces = _whitespace_pieces(w.get("chars") or [])
            if not pieces or not all(
                p[0] in (_DOLLAR, _PERCENT) or _COMPOUND_VALUE_PIECE.match(p[0])
                for p in pieces
            ):
                result.append(base)
                continue

            groups: list[list[tuple[str, float, float]]] = []
            for piece in pieces:
                if piece[0] == _PERCENT and groups:
                    groups[-1].append(piece)
                elif groups and [p[0] for p in groups[-1]] == [_DOLLAR] and piece[0] != _DOLLAR:
                    groups[-1].append(piece)
                else:
                    groups.append([piece])

            value_groups: int = sum(
                1 for g in groups if any(p[0] not in (_DOLLAR, _PERCENT) for p in g)
            )
            if value_groups < 2:
                result.append(base)
                continue

            for g in groups:
                result.append({
                    **base,
                    "text": " ".join(p[0] for p in g),
                    "x0": g[0][1],
                    "x1": g[-1][2],
                })
        return result

    @staticmethod
    def _split_straddling_words(
        words: list[dict], columns: list[SpatialColumn],
    ) -> list[dict]:
        """Split word tokens that straddle two adjacent columns.

        When pdfplumber's x_tolerance merges characters from adjacent columns
        into a single word token (e.g., "(6,288) (31.5)%"), the word's center
        may land in one column while part of its text belongs to the next.
        This splits such words at the column boundary by finding a space in
        the text near the proportional position of the boundary.

        Only splits when both resulting parts look like numeric values,
        percentages, or dashes — not label text.
        """
        import re
        # Pattern matching values: numbers (with commas, parens), percentages,
        # dashes, or dollar amounts
        _value_pat = re.compile(
            r'^[\s$]*[\(]?[\d,]+\.?\d*[\)]?%?$'  # (6,288), 31.5%, $100
            r'|^—$'                                 # em-dash
            r'|^[\(]?[\d.]+[\)]?%$'                 # (31.5)%, 3.0%
            r'|^—%$'                                 # —%
            r'|^n/a$'                                # n/a
        )

        col_boundaries = [(c.x0, c.x1) for c in columns]
        result: list[dict] = []

        for w in words:
            text = w["text"]
            wx0, wx1 = w["x0"], w["x1"]
            word_width = wx1 - wx0

            # Only consider words wide enough to plausibly span two columns
            # and that contain a space (potential split point)
            if word_width < 15 or " " not in text.strip():
                result.append(w)
                continue

            # Check if the word extends significantly past any column boundary
            split_done = False
            for i, (cx0, cx1) in enumerate(col_boundaries[:-1]):
                # Word starts in (or just before) this column and extends
                # into the next
                if wx0 >= cx0 - 5 and wx0 < cx1 and wx1 > cx1 + 3:
                    overflow = wx1 - cx1
                    # At least 20% of word width overflows into next column
                    if overflow / word_width < 0.2:
                        continue
                    # Find the proportional position of the boundary in text
                    boundary_frac = (cx1 - wx0) / word_width
                    target_pos = int(boundary_frac * len(text))
                    # Find the nearest space to split at
                    best_space = -1
                    best_dist = len(text)
                    for sp in range(len(text)):
                        if text[sp] == " ":
                            dist = abs(sp - target_pos)
                            if dist < best_dist:
                                best_dist = dist
                                best_space = sp
                    if best_space > 0 and best_space < len(text) - 1:
                        left_text = text[:best_space].strip()
                        right_text = text[best_space + 1:].strip()
                        # Only split if both parts look like numeric values,
                        # not label text
                        if (_value_pat.match(left_text)
                                and _value_pat.match(right_text)):
                            split_frac = best_space / len(text)
                            split_x = wx0 + split_frac * word_width
                            left_w = {**w, "text": left_text, "x1": split_x}
                            right_w = {**w, "text": right_text, "x0": split_x}
                            result.append(left_w)
                            result.append(right_w)
                            split_done = True
                            break
            if not split_done:
                result.append(w)

        return result

    def _assign_cells(
        self,
        row_groups: list[list[dict]],
        columns: list[SpatialColumn],
    ) -> list[SpatialRow]:
        """Assign words to columns for each row, producing cell text."""
        rows: list[SpatialRow] = []

        for row_words in row_groups:
            y0 = min(w["top"] for w in row_words)
            y1 = max(w["bottom"] for w in row_words)

            # Split word tokens that straddle column boundaries (e.g.,
            # "149,760  3,664,627" bridged by keep_blank_chars whitespace)
            row_words = self._split_straddling_words(row_words, columns)

            cells: list[str] = []
            for col in columns:
                col_words = [
                    w for w in row_words
                    if self._word_in_column(w, col.x0, col.x1)
                ]
                # Strip standalone '$' and whitespace-only words from cell output
                if self.strip_dollar_signs:
                    col_words = [
                        w for w in col_words
                        if w["text"].strip() not in ("$", "")
                    ]
                col_words.sort(key=lambda w: w["x0"])
                cell_text = " ".join(w["text"] for w in col_words).strip()
                if self.strip_dollar_signs:
                    # Strip trailing ' $' when pdfplumber merges a dollar sign
                    # from the next column into the same word token as the value
                    if cell_text.endswith(" $"):
                        cell_text = cell_text[:-2]
                    # Strip leading '$ ' when the dollar sign is part of the
                    # value token (e.g., "$ 2,752,838" in total rows)
                    if cell_text.startswith("$ "):
                        cell_text = cell_text[2:]
                    elif cell_text.startswith("$"):
                        cell_text = cell_text[1:]
                cells.append(cell_text)

            rows.append(SpatialRow(y0=y0, y1=y1, cells=cells))

        return rows

    @staticmethod
    def _merge_multiline_rows(rows: list[SpatialRow]) -> list[SpatialRow]:
        """
        Merge rows that are fragments of a single multi-line table row.

        When a position title wraps across lines in the PDF, the extractor
        produces separate rows: one with only the label column filled, one
        with only the data columns, and possibly a trailing label fragment.
        This method merges them back together.

        A row is considered a label-only fragment if it has content only in
        column 0 and that content is non-numeric text.
        """
        import re

        if len(rows) < 2:
            return rows

        def is_label_only(row: SpatialRow) -> bool:
            """Row has text in column 0 and nothing in any other column."""
            if not row.cells or not row.cells[0].strip():
                return False
            # Column 0 must be non-numeric text
            c0 = row.cells[0].strip()
            if re.match(r'^[\d$,.()\-%\s]+$', c0):
                return False
            # All other columns must be empty
            return all(not c.strip() for c in row.cells[1:])

        def is_data_no_label(row: SpatialRow) -> bool:
            """Row has empty column 0 but data in other columns."""
            if not row.cells:
                return False
            if row.cells[0].strip():
                return False
            return any(c.strip() for c in row.cells[1:])

        merged: list[SpatialRow] = []
        i = 0
        while i < len(rows):
            row = rows[i]

            # Look for pattern: label-only row followed by data-no-label row,
            # optionally followed by more label-only fragments
            if is_label_only(row) and i + 1 < len(rows) and is_data_no_label(rows[i + 1]):
                label_parts = [row.cells[0]]
                data_row = rows[i + 1]

                # Collect any trailing label fragments
                j = i + 2
                while j < len(rows) and is_label_only(rows[j]):
                    label_parts.append(rows[j].cells[0])
                    j += 1

                # Merge: combine label text into column 0 of data row
                combined_label = " ".join(label_parts)
                new_cells = [combined_label] + list(data_row.cells[1:])
                merged.append(SpatialRow(
                    y0=row.y0,
                    y1=rows[j - 1].y1,
                    cells=new_cells,
                ))
                i = j
            else:
                merged.append(row)
                i += 1

        return merged

    def _remove_empty_columns(
        self,
        columns: list[SpatialColumn],
        rows: list[SpatialRow],
    ) -> tuple[list[SpatialColumn], list[SpatialRow]]:
        """
        Remove columns that are empty in every row and merge their space
        into the adjacent column.
        """
        if not columns or not rows:
            return columns, rows

        # Find which columns have content in at least one row
        non_empty = set()
        for row in rows:
            for i, cell in enumerate(row.cells):
                if cell.strip():
                    non_empty.add(i)

        if len(non_empty) == len(columns):
            return columns, rows  # Nothing to remove

        # Build new column list, expanding neighbors to absorb empty columns.
        # Each kept column absorbs the empty space to its right (up to the
        # next kept column's original x0). The first column also absorbs
        # empty space to its left.
        keep_indices: list[int] = sorted(non_empty)
        if not keep_indices:
            return columns, rows

        new_columns: list[SpatialColumn] = []
        for ki, col_idx in enumerate(keep_indices):
            col = columns[col_idx]
            # Left edge: absorb preceding empty columns
            if ki == 0:
                new_x0 = columns[0].x0
            else:
                new_x0 = col.x0
            # Right edge: absorb following empty columns up to next kept col
            if ki == len(keep_indices) - 1:
                new_x1 = columns[-1].x1
            else:
                next_kept = keep_indices[ki + 1]
                new_x1 = columns[next_kept].x0
            new_columns.append(SpatialColumn(
                x0=new_x0, x1=new_x1, alignment=col.alignment,
            ))

        # Rebuild row cells
        new_rows: list[SpatialRow] = []
        for row in rows:
            new_cells = [row.cells[i] for i in keep_indices]
            new_rows.append(SpatialRow(y0=row.y0, y1=row.y1, cells=new_cells))

        return new_columns, new_rows

    @staticmethod
    def _collapse_sparse_label_columns(
        columns: list[SpatialColumn],
        rows: list[SpatialRow],
        headers: list[str] | None = None,
    ) -> tuple[list[SpatialColumn], list[SpatialRow]]:
        """Merge nearly-empty early columns into the first label column.

        When dollar-sign detection creates a phantom column between the label
        column and the first data column, total-row labels like "Revenues Total"
        end up in this phantom column while normal rows have it empty. This
        detects such columns (non-first, <= 25% fill rate, no header, all
        non-numeric text) and merges them left into the preceding column.
        """
        import re

        if len(columns) < 3 or not rows:
            return columns, rows

        # Only consider the first few columns (label area, before data)
        merge_into_prev: set[int] = set()
        for col_idx in range(1, min(3, len(columns))):
            # Skip columns that have a header — they're intentional
            if headers and col_idx < len(headers) and headers[col_idx].strip():
                continue
            filled = sum(
                1 for row in rows
                if col_idx < len(row.cells) and row.cells[col_idx].strip()
            )
            fill_rate = filled / len(rows) if rows else 1.0
            if fill_rate > 0.25:
                continue
            # All filled cells must be non-numeric label text
            all_labels = all(
                not re.match(r'^[\d$,.()\-%\s]+$', row.cells[col_idx].strip())
                for row in rows
                if col_idx < len(row.cells) and row.cells[col_idx].strip()
            )
            if filled > 0 and all_labels:
                merge_into_prev.add(col_idx)

        if not merge_into_prev:
            return columns, rows

        # Rebuild: merge flagged columns into the column to their left
        new_columns: list[SpatialColumn] = []
        new_rows: list[SpatialRow] = [
            SpatialRow(y0=r.y0, y1=r.y1, cells=[]) for r in rows
        ]
        for col_idx, col in enumerate(columns):
            if col_idx in merge_into_prev and new_columns:
                # Extend previous column's x1
                prev = new_columns[-1]
                new_columns[-1] = SpatialColumn(
                    x0=prev.x0, x1=col.x1, alignment=prev.alignment,
                )
                # Merge cell text: prepend sparse column's text to prev column
                for ri, row in enumerate(rows):
                    sparse_text = row.cells[col_idx].strip() if col_idx < len(row.cells) else ""
                    if sparse_text:
                        prev_text = new_rows[ri].cells[-1]
                        new_rows[ri].cells[-1] = (
                            prev_text + " " + sparse_text if prev_text else sparse_text
                        )
            else:
                new_columns.append(SpatialColumn(
                    x0=col.x0, x1=col.x1, alignment=col.alignment,
                ))
                for ri, row in enumerate(rows):
                    cell = row.cells[col_idx] if col_idx < len(row.cells) else ""
                    new_rows[ri].cells.append(cell)

        return new_columns, new_rows

    def _remove_empty_columns_with_headers(
        self,
        columns: list[SpatialColumn],
        rows: list[SpatialRow],
        headers: list[str],
    ) -> tuple[list[SpatialColumn], list[SpatialRow], list[str]]:
        """
        Remove columns that are empty in every data row AND have no header text.

        Columns with header text (e.g., 'Rate/ Grade') are preserved even when
        all data rows are empty, since the header indicates an intentional column.
        """
        if not columns or not rows:
            return columns, rows, headers

        # Find columns with content in data or header
        non_empty: set[int] = set()
        for row in rows:
            for i, cell in enumerate(row.cells):
                if cell.strip():
                    non_empty.add(i)
        for i, hdr in enumerate(headers):
            if hdr.strip():
                non_empty.add(i)

        if len(non_empty) == len(columns):
            return columns, rows, headers

        keep_indices: list[int] = sorted(non_empty)
        if not keep_indices:
            return columns, rows, headers

        # Build new columns, absorbing empty neighbors
        new_columns: list[SpatialColumn] = []
        for ki, col_idx in enumerate(keep_indices):
            col = columns[col_idx]
            new_x0 = columns[0].x0 if ki == 0 else col.x0
            if ki == len(keep_indices) - 1:
                new_x1 = columns[-1].x1
            else:
                next_kept = keep_indices[ki + 1]
                new_x1 = columns[next_kept].x0
            new_columns.append(SpatialColumn(
                x0=new_x0, x1=new_x1, alignment=col.alignment,
            ))

        new_rows: list[SpatialRow] = []
        for row in rows:
            new_cells = [row.cells[i] for i in keep_indices]
            new_rows.append(SpatialRow(y0=row.y0, y1=row.y1, cells=new_cells))

        new_headers = [headers[i] for i in keep_indices]

        return new_columns, new_rows, new_headers

    def _word_in_column(self, word: dict, col_x0: float, col_x1: float) -> bool:
        """Check if a word's horizontal center falls within a column."""
        word_center = (word["x0"] + word["x1"]) / 2
        if col_x0 <= word_center <= col_x1:
            return True
        return False

    # ── Cross-page table merging ────────────────────────────────────

    @staticmethod
    def _columns_match(
        a: list[SpatialColumn], b: list[SpatialColumn], tolerance: float = 5.0,
    ) -> bool:
        """Check if two column lists have the same structure (count + x-positions)."""
        if len(a) != len(b):
            return False
        return all(
            abs(ca.x0 - cb.x0) < tolerance and abs(ca.x1 - cb.x1) < tolerance
            for ca, cb in zip(a, b)
        )

    @staticmethod
    def merge_continuation_tables(
        page_tables: dict[int, list[SpatialTable]],
    ) -> dict[int, list[SpatialTable]]:
        """Merge tables that continue across page breaks.

        When the last table on page N and the first table on page N+1 share the
        same column structure and the continuation table has no meaningful header,
        append the continuation rows to the previous table and remove the duplicate.

        Args:
            page_tables: dict mapping page index → list of SpatialTable objects.

        Returns:
            Updated dict with continuation tables merged into their predecessors.
        """
        import re

        # A header cell that looks like a dollar amount indicates the "header"
        # is actually a data row from a continuation table, not column labels.
        _dollar_value_re = re.compile(r"^\$\d")

        sorted_pages = sorted(page_tables.keys())
        if len(sorted_pages) < 2:
            return page_tables

        # Track the "active" table that may absorb continuations across
        # multiple pages (e.g., P3→P4→P5→P6 chain).
        active_table: Optional[SpatialTable] = None

        for page_idx in sorted_pages:
            tables = page_tables.get(page_idx, [])
            if not tables:
                continue

            first_table = tables[0]

            # Try to merge the first table on this page into the active chain.
            # Two paths: (1) columns match exactly (within tolerance), or
            # (2) column count matches and headers are identical text
            # (the PDF reprinted headers on a continuation page whose
            # columns shifted slightly due to different word widths).
            if active_table is not None:
                cols_match = SpatialTableExtractor._columns_match(
                    active_table.columns, first_table.columns
                )
                same_col_count = len(active_table.columns) == len(first_table.columns)

                headers = first_table.headers or []
                active_headers = active_table.headers or []
                has_content = any(cell.strip() for cell in headers)

                # Repeated headers: same text as the active table
                is_repeated_header = (
                    has_content
                    and len(headers) == len(active_headers)
                    and all(
                        h.strip() == ah.strip()
                        for h, ah in zip(headers, active_headers)
                    )
                )

                can_merge = cols_match or (same_col_count and is_repeated_header)

                if can_merge:
                    # A continuation table's "header" is really a data row.
                    # Detect this by checking for dollar-amount cells — real
                    # column headers (like "Fee Description", "2026") won't
                    # match, but data rows ("105.6.43 Tent...", "$32.96") will.
                    is_data_header = any(
                        _dollar_value_re.match(cell.strip())
                        for cell in headers if cell
                    )
                    # Also treat completely empty headers as continuation
                    is_continuation = is_data_header or not has_content or is_repeated_header

                    if is_continuation:
                        # Merge: append continuation rows to the active table
                        if has_content and not is_repeated_header:
                            # Header row is actually data — prepend it as a row
                            active_table.rows.append(SpatialRow(
                                y0=0, y1=0, cells=headers,
                            ))
                        active_table.rows.extend(first_table.rows)

                        # Remove the merged table from this page
                        tables.pop(0)
                        page_tables[page_idx] = tables

                        # If this page still has tables, the last one becomes
                        # the new active candidate; otherwise keep chaining
                        if tables:
                            active_table = tables[-1]
                        continue

            # No merge happened — set the active table to the last on this page
            active_table = tables[-1] if tables else None

        return page_tables

    # ── Debug visualization ─────────────────────────────────────────

    def render_debug_pdf(
        self,
        input_pdf_path: str | Path,
        output_pdf_path: str | Path,
        pages: Optional[list[int]] = None,
        bboxes: Optional[dict[int, tuple[float, float, float, float]]] = None,
    ) -> Path:
        """
        Create an annotated copy of the PDF with column/row boundaries drawn.

        Each sub-table gets its own color. Draws:
        - Colored vertical dashed lines at column boundaries
        - Red horizontal lines at row boundaries
        - Colored cell fills
        - Column index labels at the top of each column
        - Yellow dashed lines at detected sub-table separators

        Args:
            input_pdf_path: Path to the source PDF.
            output_pdf_path: Path to write the annotated PDF.
            pages: 0-indexed page numbers to annotate. None = all pages.
            bboxes: Optional dict mapping page index to a crop bbox for that page.

        Returns:
            Path to the output file.
        """
        import fitz  # PyMuPDF

        input_pdf_path = Path(input_pdf_path)
        output_pdf_path = Path(output_pdf_path)
        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)

        import pdfplumber
        plumber_pdf = pdfplumber.open(input_pdf_path)
        mu_doc = fitz.open(str(input_pdf_path))

        target_pages = pages if pages is not None else list(range(len(plumber_pdf.pages)))

        for page_idx in target_pages:
            if page_idx >= len(plumber_pdf.pages):
                continue

            plumber_page = plumber_pdf.pages[page_idx]
            mu_page = mu_doc[page_idx]

            bbox = bboxes.get(page_idx) if bboxes else None
            tables = self.extract_tables(plumber_page, bbox=bbox)

            for table_idx, table in enumerate(tables):
                if not table.columns or not table.rows:
                    continue

                color_idx = table_idx % len(_TABLE_COLORS)
                fill_color = _TABLE_COLORS[color_idx]
                border_color = _BORDER_COLORS[color_idx]

                region_y0 = table.rows[0].y0 - 2
                region_y1 = table.rows[-1].y1 + 2

                # Draw cell fills
                for row in table.rows:
                    for col in table.columns:
                        rect = fitz.Rect(col.x0, row.y0, col.x1, row.y1)
                        mu_page.draw_rect(
                            rect, color=None, fill=fill_color, fill_opacity=0.4,
                        )

                # Draw column boundary lines
                for col in table.columns:
                    mu_page.draw_line(
                        fitz.Point(col.x0, region_y0),
                        fitz.Point(col.x0, region_y1),
                        color=border_color, width=0.5, dashes="[2] 0",
                    )
                last_col = table.columns[-1]
                mu_page.draw_line(
                    fitz.Point(last_col.x1, region_y0),
                    fitz.Point(last_col.x1, region_y1),
                    color=border_color, width=0.5, dashes="[2] 0",
                )

                # Draw column index labels
                for i, col in enumerate(table.columns):
                    label_pt = fitz.Point(col.x0 + 2, region_y0 - 2)
                    mu_page.insert_text(
                        label_pt,
                        f"T{table_idx}C{i} ({col.alignment[0]})",
                        fontsize=6,
                        color=border_color,
                    )

                # Draw row boundary lines
                for row in table.rows:
                    mu_page.draw_line(
                        fitz.Point(table.columns[0].x0, row.y0),
                        fitz.Point(table.columns[-1].x1, row.y0),
                        color=(0.8, 0, 0), width=0.3,
                    )
                last_row = table.rows[-1]
                mu_page.draw_line(
                    fitz.Point(table.columns[0].x0, last_row.y1),
                    fitz.Point(table.columns[-1].x1, last_row.y1),
                    color=(0.8, 0, 0), width=0.3,
                )

        mu_doc.save(str(output_pdf_path))
        mu_doc.close()
        plumber_pdf.close()

        return output_pdf_path

    def render_debug(
        self,
        input_pdf_path: str | Path,
        output_dir: str | Path,
        pages: Optional[list[int]] = None,
        bboxes: Optional[dict[int, tuple[float, float, float, float]]] = None,
        csv_only: bool = False,
        render_images: bool = False,
    ) -> Path:
        """
        Generate a full debug output: annotated PDF, per-table CSVs, and
        optionally per-page PNG images.

        Creates:
        - {output_dir}/{stem}/debug.pdf — annotated PDF with boundaries
        - {output_dir}/{stem}/P{page}T{table}.csv — one CSV per sub-table
        - {output_dir}/{stem}/P{page}.png — (if render_images=True) page images

        Args:
            input_pdf_path: Path to the source PDF.
            output_dir: Directory to write debug outputs.
            pages: 0-indexed page numbers to process. None = all pages.
            bboxes: Optional dict mapping page index to a crop bbox.
            csv_only: If True, skip generating the annotated debug PDF.
            render_images: If True, render each page of the debug PDF as a PNG.

        Returns:
            Path to the per-PDF output directory.
        """
        import csv

        import pdfplumber

        input_pdf_path = Path(input_pdf_path)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        stem = input_pdf_path.stem

        # Use a per-PDF subdirectory within the output dir
        pdf_dir = output_dir / stem
        pdf_dir.mkdir(parents=True, exist_ok=True)

        # Remove stale CSVs and content JSONs from previous runs
        for old_file in pdf_dir.glob("P*T*.csv"):
            old_file.unlink()
        for old_file in pdf_dir.glob("P*.content.json"):
            old_file.unlink()
        for old_file in pdf_dir.glob("P*I*.png"):
            old_file.unlink()

        # Generate annotated PDF (skip when only CSVs are needed)
        debug_pdf_path = pdf_dir / "debug.pdf"
        if not csv_only:
            self.render_debug_pdf(input_pdf_path, debug_pdf_path, pages=pages, bboxes=bboxes)

        # Generate per-table CSVs and per-page content JSON
        plumber_pdf = pdfplumber.open(input_pdf_path)
        target_pages = pages if pages is not None else list(range(len(plumber_pdf.pages)))

        # Collect all tables and content per page
        page_tables: dict[int, list[SpatialTable]] = {}
        page_contents: dict[int, PageContent] = {}
        for page_idx in target_pages:
            if page_idx >= len(plumber_pdf.pages):
                continue

            plumber_page = plumber_pdf.pages[page_idx]
            bbox = bboxes.get(page_idx) if bboxes else None
            tables, content = self.extract_page_content(plumber_page, bbox=bbox)

            # Fall back to OCR for image-based pages (e.g., MMO worksheets)
            if not tables:
                try:
                    from utils.ocr_table_extractor import extract_mmo_tables

                    tables = extract_mmo_tables(plumber_page)
                except ImportError:
                    pass

            page_tables[page_idx] = [t for t in tables if t.rows]
            page_contents[page_idx] = content

        # Merge tables that continue across page breaks
        page_tables = self.merge_continuation_tables(page_tables)

        # Write CSVs
        for page_idx in target_pages:
            for table_idx, table in enumerate(page_tables.get(page_idx, [])):
                csv_path = pdf_dir / f"P{page_idx}T{table_idx}.csv"
                sections = assign_sections(table)
                has_sections = any(s != "" for s in sections)
                with open(csv_path, "w", newline="") as f:
                    writer = csv.writer(f)
                    # Header row with column metadata
                    header = [
                        f"C{i} ({col.alignment[0]}, x:{col.x0:.0f}-{col.x1:.0f})"
                        for i, col in enumerate(table.columns)
                    ]
                    if has_sections:
                        header.append("section")
                    writer.writerow(header)
                    if table.headers:
                        # Fix header/column count mismatch: strip extra empty
                        # headers that don't correspond to data columns.
                        out_headers = table.headers
                        num_cols = len(table.columns)
                        if len(out_headers) > num_cols:
                            empty_idxs = [i for i, h in enumerate(out_headers) if not h.strip()]
                            extra = len(out_headers) - num_cols
                            if len(empty_idxs) >= extra:
                                remove = set(empty_idxs[:extra])
                                out_headers = [h for i, h in enumerate(out_headers) if i not in remove]
                        row_with_section = out_headers + (["section"] if has_sections else [])
                        writer.writerow(row_with_section)
                    for row, section in zip(table.rows, sections):
                        row_data = row.cells + ([section] if has_sections else [])
                        writer.writerow(row_data)

        # Write per-page content JSON (text blocks + chart regions)
        import json

        for page_idx, content in page_contents.items():
            if not content.text_blocks and not content.chart_regions:
                continue
            content_path = pdf_dir / f"P{page_idx}.content.json"
            content_data = {
                "text_blocks": [
                    {
                        "role": block.role,
                        "text": block.text,
                        "bbox": [round(v, 1) for v in block.bbox],
                    }
                    for block in content.text_blocks
                ],
                "chart_regions": [
                    {
                        "chart_type": chart.chart_type,
                        "bbox": [round(v, 1) for v in chart.bbox],
                    }
                    for chart in content.chart_regions
                ],
            }
            with open(content_path, "w") as f:
                json.dump(content_data, f, indent=2)

        # Render chart region crops as PNGs
        if not csv_only:
            try:
                import fitz  # PyMuPDF

                source_doc = fitz.open(str(input_pdf_path))
                for page_idx, content in page_contents.items():
                    for ci, chart in enumerate(content.chart_regions):
                        if page_idx >= len(source_doc):
                            continue
                        fitz_page = source_doc[page_idx]
                        x0, y0, x1, y1 = chart.bbox
                        clip = fitz.Rect(x0, y0, x1, y1)
                        pix = fitz_page.get_pixmap(dpi=150, clip=clip)
                        pix.save(str(pdf_dir / f"P{page_idx}I{ci}.png"))
                source_doc.close()
            except ImportError:
                pass

        plumber_pdf.close()

        # Render debug PDF pages as PNG images for visual inspection
        if render_images and not csv_only and debug_pdf_path.exists():
            import fitz  # PyMuPDF

            debug_doc = fitz.open(str(debug_pdf_path))
            for i, page in enumerate(debug_doc):
                page_idx = target_pages[i] if i < len(target_pages) else i
                pix = page.get_pixmap(dpi=150)
                pix.save(str(pdf_dir / f"P{page_idx}.png"))
            debug_doc.close()

        return pdf_dir


def _variance(values: list[float]) -> float:
    """Compute variance of a list of numbers."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)
