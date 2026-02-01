"""PDF extraction logic for grants data."""

import re
from pathlib import Path

import pdfplumber

from .models import GrantLineItem, GrantPosition, GrantsData


class GrantsExtractor:
    """Extracts structured data from the Grants PDF document."""

    # Department header patterns
    DEPARTMENT_HEADERS: list[str] = [
        "Office of the City Clerk",
        "Office of the Mayor",
        "Office of Management and Budget",
        "Department of Innovation and Performance",
        "Department of City Planning",
        "Department of Public Safety - Bureau of Administration",
        "Department of Public Safety - Bureau of Police",
        "Department of Public Safety - Bureau of Emergency Services",
        "Department of Public Safety - Bureau of Fire",
        "Department of Public Works",
        "Department of Parks and Recreation",
        "Department of Mobility and Infrastructure",
        "Urban Redevelopment Authority",
    ]

    def __init__(self, pdf_path: str | Path):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {self.pdf_path}")

        self._pages: list[str] = []
        self._raw_text: str = ""

    def extract(self) -> GrantsData:
        self._load_pdf()

        narrative = self._extract_narrative()
        grants = self._extract_grants_by_position()
        positions = self._extract_positions()

        return GrantsData(
            narrative=narrative,
            grants=grants,
            positions=positions,
            source_file=self.pdf_path.name,
        )

    def _load_pdf(self) -> None:
        self._pages = []
        with pdfplumber.open(self.pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                self._pages.append(text)
        self._raw_text = "\n".join(self._pages)

    def _extract_narrative(self) -> str | None:
        if len(self._pages) < 2:
            return None

        page_text = self._pages[1]
        match = re.search(
            r"Grants Office\s*\n(.+?)(?=City of Pittsburgh Operating Budget|$)",
            page_text,
            re.DOTALL,
        )

        if match:
            narrative = match.group(1).strip()
            narrative = re.sub(r"\s+", " ", narrative)
            return narrative
        return None

    def _extract_grants_by_position(self) -> list[GrantLineItem]:
        """Extract grants using word-level positioning to properly group data."""
        grants: list[GrantLineItem] = []

        with pdfplumber.open(self.pdf_path) as pdf:
            for page_idx in range(2, min(len(pdf.pages), 11)):
                page = pdf.pages[page_idx]
                page_text = page.extract_text() or ""

                # Stop at position summaries
                if "Position Summary:" in page_text:
                    break

                words = page.extract_words()
                if not words:
                    continue

                # Find department headers on this page with their y-positions
                dept_positions = self._find_department_positions(words)

                if not dept_positions:
                    continue

                # Find JDE numbers (9-10 digit codes in leftmost column)
                jde_words = [
                    w for w in words
                    if re.match(r"^\d{9,10}$", w["text"]) and w["x0"] < 120
                ]

                # Sort by y position
                jde_words.sort(key=lambda w: w["top"])

                for i, jde_word in enumerate(jde_words):
                    jde_number = jde_word["text"]
                    jde_top = jde_word["top"]

                    # Determine which department this JDE belongs to
                    department = self._get_department_for_position(jde_top, dept_positions)
                    if not department:
                        continue

                    # Determine y-range for this record
                    # Stop at: next JDE, next department header, or max 45 pixels
                    y_end = jde_top + 45

                    # Check for next JDE
                    if i + 1 < len(jde_words):
                        y_end = min(y_end, jde_words[i + 1]["top"])

                    # Check for next department header
                    next_dept_y = self._get_next_department_y(jde_top, dept_positions)
                    if next_dept_y is not None:
                        y_end = min(y_end, next_dept_y)

                    # Collect all words in this record's y-range
                    record_words = [
                        w for w in words
                        if jde_top - 5 <= w["top"] < y_end
                        and w["text"] != jde_number
                        and not self._is_department_word(w, dept_positions)
                    ]

                    # Group by column based on x position
                    # Columns: ~120-220 (Funder), ~220-420 (Grant), ~420+ (Amounts)
                    funder_words = [w for w in record_words if 100 < w["x0"] < 210]
                    grant_words = [w for w in record_words if 200 < w["x0"] < 420]
                    amount_words = [w for w in record_words if w["x0"] >= 410]

                    # Build text
                    funder = self._words_to_text(funder_words)
                    grant_desc = self._words_to_text(grant_words)

                    # Extract amounts
                    amount_text = " ".join(w["text"] for w in sorted(amount_words, key=lambda w: w["x0"]))
                    amounts = self._extract_amounts(amount_text)

                    # Clean and validate
                    funder = self._clean_text(funder)
                    grant_desc = self._clean_text(grant_desc)

                    if funder and grant_desc and any(a is not None for a in amounts):
                        grants.append(
                            GrantLineItem(
                                department=department,
                                jde_number=jde_number,
                                funder=funder,
                                grant_description=grant_desc,
                                amount_awarded=amounts[0],
                                amount_spent=amounts[1],
                                remaining_balance=amounts[2],
                            )
                        )

        return grants

    def _find_department_positions(self, words: list[dict]) -> list[tuple[str, float]]:
        """Find department headers and their y-positions on a page."""
        dept_positions: list[tuple[str, float]] = []

        # Build text by line to find department headers
        lines_by_y: dict[int, list[dict]] = {}
        for w in words:
            y_bucket = round(w["top"] / 10) * 10
            if y_bucket not in lines_by_y:
                lines_by_y[y_bucket] = []
            lines_by_y[y_bucket].append(w)

        for y_bucket in sorted(lines_by_y.keys()):
            line_words = sorted(lines_by_y[y_bucket], key=lambda w: w["x0"])
            line_text = " ".join(w["text"] for w in line_words)

            for dept in self.DEPARTMENT_HEADERS:
                if dept in line_text:
                    # Get the actual y position from the first word
                    y_pos = min(w["top"] for w in line_words)
                    dept_positions.append((dept, y_pos))
                    break

        return dept_positions

    def _get_department_for_position(
        self, y_pos: float, dept_positions: list[tuple[str, float]]
    ) -> str | None:
        """Get the department that owns a given y-position."""
        if not dept_positions:
            return None

        # Find the department header that appears just before this y position
        current_dept = None
        for dept, dept_y in dept_positions:
            if dept_y <= y_pos:
                current_dept = dept
            else:
                break

        return current_dept

    def _get_next_department_y(
        self, y_pos: float, dept_positions: list[tuple[str, float]]
    ) -> float | None:
        """Get the y-position of the next department header after y_pos."""
        for dept, dept_y in dept_positions:
            if dept_y > y_pos:
                return dept_y
        return None

    def _is_department_word(
        self, word: dict, dept_positions: list[tuple[str, float]]
    ) -> bool:
        """Check if a word is part of a department header."""
        word_y = word["top"]
        for dept, dept_y in dept_positions:
            # Check if word is on the same line as a department header
            if abs(word_y - dept_y) < 15:
                return True
        return False

    def _words_to_text(self, words: list[dict]) -> str:
        if not words:
            return ""

        # Sort by y (line), then x (position in line)
        sorted_words = sorted(words, key=lambda w: (round(w["top"] / 5) * 5, w["x0"]))

        # Group into lines
        lines: list[list[str]] = []
        current_line: list[str] = []
        current_y = None

        for word in sorted_words:
            word_y = round(word["top"] / 5) * 5
            if current_y is None or word_y == current_y:
                current_line.append(word["text"])
                current_y = word_y
            else:
                if current_line:
                    lines.append(current_line)
                current_line = [word["text"]]
                current_y = word_y

        if current_line:
            lines.append(current_line)

        return " ".join(" ".join(line) for line in lines)

    def _extract_amounts(self, text: str) -> tuple[float | None, float | None, float | None]:
        """Extract three amounts from text."""
        amounts = re.findall(r"[\$]?\s*([\d,]+(?:\.\d+)?|\([\d,]+(?:\.\d+)?\)|—)", text)

        result = [None, None, None]
        if len(amounts) >= 3:
            for i, amt in enumerate(amounts[-3:]):
                result[i] = self._parse_amount(amt)

        return (result[0], result[1], result[2])

    def _clean_text(self, text: str) -> str:
        """Remove header/footer text and normalize whitespace."""
        if not text:
            return ""

        # Remove common header patterns
        patterns = [
            r"JDE\s+Amount",
            r"Number\s+Awarded",
            r"Funder\s+Grant",
            r"Amount\s+Spent",
            r"Remaining\s+Balance",
            r"City\s+of\s+Pittsburgh",
            r"Operating\s+Budget",
            r"Fiscal\s+Year\s+\d+",
            r"Grants$",
        ]
        for pattern in patterns:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        return re.sub(r"\s+", " ", text).strip()

    def _detect_department(self, line: str) -> str | None:
        normalized = re.sub(r"\s+", " ", line).strip()
        for dept in self.DEPARTMENT_HEADERS:
            if dept in normalized:
                return dept
        return None

    def _extract_positions(self) -> list[GrantPosition]:
        positions: list[GrantPosition] = []
        current_jde: str | None = None
        current_program: str | None = None
        in_position_section = False

        for line in self._raw_text.split("\n"):
            line = line.strip()

            if line.startswith("Position Summary:"):
                in_position_section = True
                program_match = re.match(r"Position Summary:\s*(.+)", line)
                if program_match:
                    current_program = program_match.group(1).strip()
                continue

            if not in_position_section:
                continue

            jde_match = re.match(r"^(\d{9,10})$", line)
            if jde_match:
                current_jde = jde_match.group(1)
                continue

            if self._is_position_header(line):
                continue

            if line.startswith("Total Full-Time Positions"):
                in_position_section = False
                continue

            if current_jde and current_program:
                position = self._parse_position_line(line, current_jde, current_program)
                if position:
                    positions.append(position)

        return positions

    def _is_position_header(self, line: str) -> bool:
        lower = line.lower()
        return (
            lower.startswith("2025")
            or lower.startswith("title")
            or "fte" in lower
            or "rate/" in lower
        )

    def _parse_position_line(
        self, line: str, jde_number: str, program_name: str
    ) -> GrantPosition | None:
        if not line or line.startswith("Total"):
            return None

        # Pattern with grade (e.g., "Senior Project Manager 1 31E 12 $ 98,517 1 29G 12 $ 101,525")
        pattern_with_grade = (
            r"^(.+?)\s+"
            r"(\d+)\s+"
            r"(\d{1,2}[A-Z])\s+"
            r"(\d+)\s*\$?\s*"
            r"([\d,]+)\s+"
            r"(\d+)\s+"
            r"(\d{1,2}[A-Z])\s+"
            r"(\d+)\s*\$?\s*"
            r"([\d,]+)\s*$"
        )

        match = re.match(pattern_with_grade, line)
        if match:
            return GrantPosition(
                jde_number=jde_number,
                program_name=program_name,
                title=match.group(1).strip(),
                fte_2025=self._parse_amount(match.group(2)),
                grade_2025=match.group(3),
                hours_months_2025=match.group(4),
                budget_2025=self._parse_amount(match.group(5)),
                fte_2026=self._parse_amount(match.group(6)),
                grade_2026=match.group(7),
                hours_months_2026=match.group(8),
                budget_2026=self._parse_amount(match.group(9)),
            )

        # Simplified pattern first: Title FTE Budget FTE Budget (no grade or hours)
        # e.g., "CIT Project Coordinator 1 69,811 1 69,811"
        # The budget amounts have commas, small single digits are likely FTE
        pattern_simple = (
            r"^(.+?)\s+"
            r"(\d+)\s+"
            r"([\d,]+)\s+"
            r"(\d+)\s+"
            r"([\d,]+)\s*$"
        )

        match = re.match(pattern_simple, line)
        if match:
            # Check if this looks like a simple pattern (budgets have commas, FTEs are small)
            fte1 = match.group(2)
            budget1 = match.group(3)
            fte2 = match.group(4)
            budget2 = match.group(5)

            # If budget values have commas or are large numbers, this is the simple pattern
            if "," in budget1 or "," in budget2 or int(fte1) <= 10:
                return GrantPosition(
                    jde_number=jde_number,
                    program_name=program_name,
                    title=match.group(1).strip(),
                    fte_2025=self._parse_amount(fte1),
                    grade_2025=None,
                    hours_months_2025=None,
                    budget_2025=self._parse_amount(budget1),
                    fte_2026=self._parse_amount(fte2),
                    grade_2026=None,
                    hours_months_2026=None,
                    budget_2026=self._parse_amount(budget2),
                )

        # Pattern with hours/months but no grade (e.g., "Tree Equity Lead 1 12 $ 60,837 1 12 $ 62,662")
        # Hours/months is typically 12 for full year or small values like 3
        pattern_with_hours = (
            r"^(.+?)\s+"
            r"(\d+)\s+"
            r"(\d{1,2})\s*\$?\s*"
            r"([\d,]+)\s+"
            r"(\d+)\s+"
            r"(\d{1,2})\s*\$?\s*"
            r"([\d,]+)\s*$"
        )

        match = re.match(pattern_with_hours, line)
        if match:
            hours1 = int(match.group(3))
            hours2 = int(match.group(6))
            # Hours/months should be small (1-12 for months, or hours like 2080)
            if hours1 <= 12 and hours2 <= 12:
                return GrantPosition(
                    jde_number=jde_number,
                    program_name=program_name,
                    title=match.group(1).strip(),
                    fte_2025=self._parse_amount(match.group(2)),
                    grade_2025=None,
                    hours_months_2025=match.group(3),
                    budget_2025=self._parse_amount(match.group(4)),
                    fte_2026=self._parse_amount(match.group(5)),
                    grade_2026=None,
                    hours_months_2026=match.group(6),
                    budget_2026=self._parse_amount(match.group(7)),
                )

        return None

    def _parse_amount(self, value: str | None) -> float | None:
        if not value or value == "—":
            return None

        is_negative = "(" in value and ")" in value
        if is_negative:
            value = value.replace("(", "").replace(")", "")

        cleaned = value.replace("$", "").replace(",", "").replace(" ", "").strip()

        try:
            amount = float(cleaned)
            return -amount if is_negative else amount
        except ValueError:
            return None
