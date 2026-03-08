"""Extract tables from PDFs using spatial word clustering, for borderless tables."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from pdfplumber.page import Page


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
        """
        Remove words belonging to page-level headers/footers.

        Groups words into rows and removes rows that match either:
        1. A known PAGE_HEADER_PATTERN, or
        2. A single-word row that sits above any multi-word row (section
           titles like "Position Summary" that appear alone on their line).
        """
        import re

        rows = self._cluster_rows(words)
        remove_ids: set[int] = set()

        # Pass 1: remove rows matching explicit patterns
        pattern_removed: set[int] = set()
        for ri, row in enumerate(rows):
            row_text = " ".join(
                w["text"].strip() for w in sorted(row, key=lambda w: w["x0"])
            )
            for pattern in self.PAGE_HEADER_PATTERNS:
                if re.search(pattern, row_text, re.IGNORECASE):
                    pattern_removed.add(ri)
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
                    for w in row:
                        remove_ids.add(id(w))

        return [w for w in words if id(w) not in remove_ids]

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
            # pdfplumber merged multiple visual rows into one cell
            for row in rows[1:]:  # skip header row
                for cell in row:
                    if cell and "\n" in cell and len(cell) > 50:
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

            results.append(SpatialTable(
                columns=columns,
                rows=spatial_rows,
                headers=headers,
                bbox=tb,
            ))

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

        native_tables = page.find_tables()
        for table in native_tables:
            rows = table.extract()
            if not rows:
                continue
            # Check for merged multi-row cells
            for row in rows[1:]:
                for cell in row:
                    if cell and "\n" in cell and len(cell) > 50:
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

            tb = native.bbox  # (x0, top, x1, bottom)

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

    def extract_tables(
        self,
        page: Page,
        bbox: Optional[tuple[float, float, float, float]] = None,
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

        Returns:
            List of SpatialTable objects, one per detected sub-table.
        """
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
        )
        if not words:
            return []

        # Save whitespace-only words — pdfplumber with keep_blank_chars
        # can produce blank words at positions where '$' signs appear on
        # other rows. These are stripped from the main word list but passed
        # to dollar separator detection as placeholder markers.
        whitespace_words = [w for w in words if not w["text"].strip()]
        words = [w for w in words if w["text"].strip()]

        # Filter out page-level header/footer words (e.g., "City of
        # Pittsburgh Operating Budget", "Fiscal Year 2026", page numbers).
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

            columns = self._detect_columns(
                region_words, row_groups, dollar_separators=region_dollar_seps,
            )
            rows = self._assign_cells(row_groups, columns)
            columns, rows = self._remove_empty_columns(columns, rows)

            r_x0 = min(c.x0 for c in columns)
            r_x1 = max(c.x1 for c in columns)
            r_y0 = rows[0].y0 if rows else region_top
            r_y1 = rows[-1].y1 if rows else region_bottom

            tables.append(SpatialTable(
                columns=columns,
                rows=rows,
                bbox=(r_x0, r_y0, r_x1, r_y1),
                _words=region_words,
                _dollar_separators=region_dollar_seps,
            ))

        # Merge small header-like sub-tables into the following data table
        tables = self._merge_header_tables(tables)

        # For tables without headers, check if the first rows are internal
        # headers (multi-line column labels within the table itself)
        for table in tables:
            if not table.headers:
                self._extract_internal_headers(table)

        # Split columns where known header patterns were merged due to
        # tight spacing (e.g., "Increase/(Decrease)" and "% Change").
        for table in tables:
            self._split_known_merged_columns(table)

        # Merge multi-line row fragments (e.g., wrapped position titles)
        for table in tables:
            table.rows = self._merge_multiline_rows(table.rows)

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
                        table.columns, table.rows = self._remove_empty_columns(
                            table.columns, table.rows,
                        )

                    # Combine header text using the (possibly updated) columns
                    table.headers = self._combine_header_rows(
                        pending_header_tables, table.columns,
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
                    extent_ok = abs(t_x0 - p_x0) < 30 and abs(t_x1 - p_x1) < 30
                    if extent_ok and col_ratio_ok:
                        table.columns = propagated_columns
                        table.headers = propagated_headers
                        row_groups = self._cluster_rows(table._words)
                        table.rows = self._assign_cells(row_groups, propagated_columns)
                    else:
                        # Different section — stop propagating
                        propagated_columns = None
                        propagated_headers = None
                        propagated_x_extent = None

                merged.append(table)

        for ht in pending_header_tables:
            merged.append(ht)

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

            if has_data:
                break

            header_count += 1

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

    def _split_known_merged_columns(self, table: SpatialTable) -> None:
        """Split columns whose headers contain known merged-column patterns.

        When tight spacing causes two conceptually separate columns to merge
        (e.g., "Increase/(Decrease)" and "% Change" becoming one column),
        this method detects the merge via header text, locates the split
        point from word positions, and splits the column and all row cells.

        Modifies the table in place.
        """
        import re

        if not table.headers or not table._words:
            return

        for col_idx, header in enumerate(table.headers):
            # Detect merged "Increase/(Decrease)" + "% Change" columns.
            # The multi-line header join order varies by PDF layout, so
            # match any header containing both "Decrease" and "Change".
            if not (re.search(r'Decrease', header, re.IGNORECASE)
                    and re.search(r'Change', header, re.IGNORECASE)):
                continue

            # Find the split point using data row words.  In rows that
            # have both a value and a percentage (e.g., "17,829" and "3.0%"),
            # there is a gap between them.  Find the largest consistent gap
            # within this column's data words.
            col = table.columns[col_idx]

            # Collect per-row gap info within this column
            gaps: list[float] = []
            for row in table.rows:
                row_words = sorted(
                    (w for w in table._words
                     if col.x0 <= w["x0"] <= col.x1
                     and abs(w["top"] - row.y0) < self.y_tolerance * 2
                     and w["text"].strip()),
                    key=lambda w: w["x0"],
                )
                if len(row_words) >= 2:
                    # Find the largest gap in this row
                    for i in range(len(row_words) - 1):
                        gap = row_words[i + 1]["x0"] - row_words[i]["x1"]
                        if gap > 3:
                            gaps.append(
                                (row_words[i]["x1"] + row_words[i + 1]["x0"]) / 2
                            )

            if not gaps:
                continue

            # Use the median gap position as split point
            gaps.sort()
            split_x: float = gaps[len(gaps) // 2]

            # Split the column
            old_col = table.columns[col_idx]
            left_col = SpatialColumn(
                x0=old_col.x0, x1=split_x, alignment=old_col.alignment,
            )
            right_col = SpatialColumn(
                x0=split_x, x1=old_col.x1, alignment=old_col.alignment,
            )
            table.columns = (
                table.columns[:col_idx]
                + [left_col, right_col]
                + table.columns[col_idx + 1:]
            )

            # Rebuild headers: the original header words may not be in
            # _words (they come from a merged header sub-table), so use
            # canonical names for the split columns.
            table.headers = (
                table.headers[:col_idx]
                + ["Increase/ (Decrease)", "% Change"]
                + table.headers[col_idx + 1:]
            )

            # Re-assign cells for all rows by distributing words
            for row in table.rows:
                # Find words in this row within the old column extent
                row_words = [
                    w for w in table._words
                    if old_col.x0 <= w["x0"] <= old_col.x1
                    and abs(w["top"] - row.y0) < self.y_tolerance * 2
                    and w["text"].strip()
                ]
                left_parts = [
                    w["text"].strip() for w in sorted(row_words, key=lambda w: w["x0"])
                    if w["x0"] < split_x
                ]
                right_parts = [
                    w["text"].strip() for w in sorted(row_words, key=lambda w: w["x0"])
                    if w["x0"] >= split_x
                ]
                left_cell = " ".join(left_parts)
                right_cell = " ".join(right_parts)

                row.cells = (
                    row.cells[:col_idx]
                    + [left_cell, right_cell]
                    + row.cells[col_idx + 1:]
                )

            # Only process one split per table
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

    # ── Column detection ────────────────────────────────────────────

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
        # A header separator is added when it corroborates either:
        # 1. A weak gap cluster (exists but didn't meet frequency threshold), or
        # 2. Sub-threshold gaps in the data (gaps too narrow for the main
        #    detector but confirmed by the header's column structure).
        if header_separators:
            header_match_radius = self.column_gap_threshold * 2
            # Find gap clusters that were rejected by frequency filter
            weak_clusters = [
                center for center, count in raw_clusters
                if 0 < count < min_count
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
                # Corroborated by a weak data-row gap cluster?
                if any(abs(hs - wc) < header_match_radius for wc in weak_clusters):
                    separators.append(hs)
                # Corroborated by sub-threshold gaps in the data?
                elif any(abs(hs - sc) < header_match_radius for sc in sub_cluster_centers):
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
                # Strip trailing ' $' when pdfplumber merges a dollar sign
                # from the next column into the same word token as the value
                if self.strip_dollar_signs and cell_text.endswith(" $"):
                    cell_text = cell_text[:-2]
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

    def _word_in_column(self, word: dict, col_x0: float, col_x1: float) -> bool:
        """Check if a word's horizontal center falls within a column."""
        word_center = (word["x0"] + word["x1"]) / 2
        return col_x0 <= word_center <= col_x1

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

        # Remove stale CSVs from previous runs for this PDF
        for old_csv in pdf_dir.glob(f"P*T*.csv"):
            old_csv.unlink()

        # Generate annotated PDF (skip when only CSVs are needed)
        debug_pdf_path = pdf_dir / "debug.pdf"
        if not csv_only:
            self.render_debug_pdf(input_pdf_path, debug_pdf_path, pages=pages, bboxes=bboxes)

        # Generate per-table CSVs
        plumber_pdf = pdfplumber.open(input_pdf_path)
        target_pages = pages if pages is not None else list(range(len(plumber_pdf.pages)))

        for page_idx in target_pages:
            if page_idx >= len(plumber_pdf.pages):
                continue

            plumber_page = plumber_pdf.pages[page_idx]
            bbox = bboxes.get(page_idx) if bboxes else None
            tables = self.extract_tables(plumber_page, bbox=bbox)

            for table_idx, table in enumerate(tables):
                if not table.rows:
                    continue

                csv_path = pdf_dir / f"P{page_idx}T{table_idx}.csv"
                with open(csv_path, "w", newline="") as f:
                    writer = csv.writer(f)
                    # Header row with column metadata
                    header = [
                        f"C{i} ({col.alignment[0]}, x:{col.x0:.0f}-{col.x1:.0f})"
                        for i, col in enumerate(table.columns)
                    ]
                    writer.writerow(header)
                    if table.headers:
                        writer.writerow(table.headers)
                    for row in table.rows:
                        writer.writerow(row.cells)

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
