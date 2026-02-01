"""PDF extraction logic for special/trust fund documents."""

import re
from pathlib import Path

import pdfplumber

from .models import BudgetLineItem, FundMetadata, PositionEntry, SpecialFund


class SpecialFundExtractor:
    """Extracts structured data from special/trust fund PDF documents."""

    def __init__(self, pdf_path: str | Path):
        """
        Initialize the extractor with a PDF file path.

        Args:
            pdf_path: Path to the special fund PDF file.
        """
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {self.pdf_path}")

        self._raw_text: str = ""
        self._pages: list[str] = []

    def extract(self) -> SpecialFund:
        """
        Extract all data from the PDF.

        Returns:
            SpecialFund object with metadata, budget lines, and positions.
        """
        self._load_pdf()

        metadata = self._extract_metadata()
        budget_lines = self._extract_budget_lines()
        positions = self._extract_positions()

        # Update totals in metadata from budget lines
        self._update_totals(metadata, budget_lines)

        return SpecialFund(
            metadata=metadata,
            budget_lines=budget_lines,
            positions=positions,
            source_file=self.pdf_path.name,
        )

    def _load_pdf(self) -> None:
        """Load PDF and extract text from all pages."""
        self._pages = []
        with pdfplumber.open(self.pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                self._pages.append(text)

        self._raw_text = "\n".join(self._pages)

    def _extract_metadata(self) -> FundMetadata:
        """Extract fund metadata from the document."""
        text = self._raw_text

        # Extract fund name and code from header
        fund_name = self._extract_pattern(
            r"City of Pittsburgh Operating Budget\s+(.+?)\n",
            text,
        )
        fund_code = self._extract_pattern(
            r"Fiscal Year 2026\s+(\d+)\n",
            text,
        )

        # Extract labeled fields - use lookahead to stop at next label
        # Each pattern captures text until the next labeled field starts
        department = self._extract_pattern(
            r"Department:\s*(.+?)(?=\nAuthorizing|\nDescription:)",
            text,
            flags=re.DOTALL,
        )
        authorizing = self._extract_pattern(
            r"Authorizing (?:Resolution|Legislation):\s*(.+?)(?=\nDescription:)",
            text,
            flags=re.DOTALL,
        )
        description = self._extract_pattern(
            r"Description:\s*(.+?)(?=\nRevenues:|\nProjected Beginning)",
            text,
            flags=re.DOTALL,
        )
        revenues_desc = self._extract_pattern(
            r"Revenues:\s*(.+?)(?=\nExpenditures:|\nProjected)",
            text,
            flags=re.DOTALL,
        )
        expenditures_desc = self._extract_pattern(
            r"Expenditures:\s*(.+?)(?=\nProjected Beginning)",
            text,
            flags=re.DOTALL,
        )

        # Extract balances
        beginning_balance = self._extract_amount(
            r"Projected Beginning Balance\s+\$?\s*([\d,]+(?:\.\d+)?)",
            text,
        )
        ending_balance = self._extract_amount(
            r"Projected Ending Balance\s+\$?\s*([\d,]+(?:\.\d+)?)",
            text,
        )

        return FundMetadata(
            fund_code=fund_code or "",
            fund_name=fund_name or "",
            department=self._clean_text(department),
            authorizing_legislation=self._clean_text(authorizing),
            description=self._clean_text(description),
            revenues_description=self._clean_text(revenues_desc),
            expenditures_description=self._clean_text(expenditures_desc),
            projected_beginning_balance=beginning_balance,
            projected_ending_balance=ending_balance,
            revenues_total_2025=None,
            revenues_total_2026=None,
            expenditures_total_2025=None,
            expenditures_total_2026=None,
            net_total_2025=None,
            net_total_2026=None,
        )

    def _extract_budget_lines(self) -> list[BudgetLineItem]:
        """Extract all budget line items (revenues and expenditures)."""
        items: list[BudgetLineItem] = []
        current_section = "revenues"

        for line in self._raw_text.split("\n"):
            line = line.strip()
            if not line:
                continue

            # Detect section changes
            if line.startswith("Revenues"):
                current_section = "revenues"
                continue
            if line.startswith("Expenditures"):
                current_section = "expenditures"
                continue

            # Skip headers/footers
            if self._is_skip_line(line):
                continue

            # Try to parse as budget line
            item = self._parse_budget_line(line, current_section)
            if item:
                items.append(item)

        return items

    def _parse_budget_line(self, line: str, section: str) -> BudgetLineItem | None:
        """Parse a single line into a BudgetLineItem if it matches expected patterns."""

        # Pattern for section totals: "Revenues Total $ 70,000 $ 70,000 $ — —%"
        total_pattern = (
            r"^(Revenues|Expenditures|Net)\s+Total\s+\$?\s*"
            r"([\d,]+(?:\.\d+)?|—|\([\d,]+\))\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—|\([\d,]+\))\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—|\([\d,]+\))"
        )
        match = re.match(total_pattern, line)
        if match:
            return BudgetLineItem(
                subclass_code="TOTAL",
                subclass_name=f"{match.group(1)} Total",
                account_code=None,
                account_name=None,
                budget_2025=self._parse_amount(match.group(2)),
                budget_2026=self._parse_amount(match.group(3)),
                change_amount=self._parse_amount(match.group(4)),
                change_percent=None,
                line_type="total",
                section=section if match.group(1) != "Net" else "net",
            )

        # Pattern for subclass headers: "51 - PERSONNEL-SALARIES & WAGES $ 4,121,346 $ 5,137,874 $ 1,016,528 24.7%"
        # Also handles: "51 - PERSONNEL-SALARIES & WAGES 4,121,346 5,137,874 1,016,528 24.7%"
        subclass_pattern = (
            r"^(\d{2})\s*-\s*([A-Z][A-Z&\s\-/]+?)\s+\$?\s*"
            r"([\d,]+(?:\.\d+)?|—)\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—)\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—|\([\d,]+(?:\.\d+)?\))\s*"
            r"([\d.]+%|—%|—)?\s*$"
        )
        match = re.match(subclass_pattern, line)
        if match:
            return BudgetLineItem(
                subclass_code=match.group(1),
                subclass_name=match.group(2).strip(),
                account_code=None,
                account_name=None,
                budget_2025=self._parse_amount(match.group(3)),
                budget_2026=self._parse_amount(match.group(4)),
                change_amount=self._parse_amount(match.group(5)),
                change_percent=self._parse_percent(match.group(6)),
                line_type="section_header",
                section=section,
            )

        # Pattern for detail lines: "51101 - Regular 3,399,287 3,693,997 294,710"
        detail_pattern = (
            r"^(\d{5})\s*-\s*(.+?)\s+"
            r"([\d,]+(?:\.\d+)?|—)\s+"
            r"([\d,]+(?:\.\d+)?|—)\s*"
            r"([\d,]+(?:\.\d+)?|—|\([\d,]+(?:\.\d+)?\))?\s*$"
        )
        match = re.match(detail_pattern, line)
        if match:
            return BudgetLineItem(
                subclass_code=match.group(1)[:2],
                subclass_name=None,
                account_code=match.group(1),
                account_name=match.group(2).strip(),
                budget_2025=self._parse_amount(match.group(3)),
                budget_2026=self._parse_amount(match.group(4)),
                change_amount=self._parse_amount(match.group(5)) if match.group(5) else None,
                change_percent=None,
                line_type="detail",
                section=section,
            )

        return None

    def _extract_positions(self) -> list[PositionEntry]:
        """Extract position/staffing data if present."""
        positions: list[PositionEntry] = []

        # Check if there's a Position Summary section
        if "Position Summary" not in self._raw_text:
            return positions

        # Find position summary sections
        in_positions = False
        current_department = None
        current_division = None
        position_type = "permanent"

        for line in self._raw_text.split("\n"):
            line = line.strip()

            if "Position Summary" in line:
                in_positions = True
                continue

            if not in_positions:
                continue

            # Detect department headers
            if line.startswith("Department of "):
                current_department = line
                current_division = None
                continue

            # Detect division headers (like "Parks Maintenance", "Architecture", etc.)
            if re.match(r"^[A-Z][a-z]+(?: [A-Z][a-z]+)*$", line) and not any(
                char.isdigit() for char in line
            ):
                current_division = line
                continue

            # Detect position type changes
            if "Temporary" in line or "Part-Time" in line or "Seasonal" in line:
                position_type = "temporary"
                continue

            # Try to parse position line
            position = self._parse_position_line(
                line, current_department, current_division, position_type
            )
            if position:
                positions.append(position)

            # Stop at end of positions section
            if line.startswith("Total Full-Time Positions and Net"):
                break

        return positions

    def _parse_position_line(
        self,
        line: str,
        department: str | None,
        division: str | None,
        position_type: str,
    ) -> PositionEntry | None:
        """Parse a single position line."""

        # Skip total lines and headers
        if line.startswith("Total") or line.startswith("Title") or "FTE" in line:
            return None

        # Pattern for position lines with salary grade:
        # "Assistant Superintendent 1 27G 12 $ 91,021 1 27G 12 $ 93,746"
        grade_pattern = (
            r"^(.+?)\s+"
            r"([\d.]+|—)\s+"
            r"(\d{2}[A-Z](?:-[A-Z])?|[\d,]+(?:\.\d+)?)\s+"
            r"(\d+|—|[\d,]+)\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—)\s+"
            r"([\d.]+|—)\s+"
            r"(\d{2}[A-Z](?:-[A-Z])?|[\d,]+(?:\.\d+)?)\s+"
            r"(\d+|—|[\d,]+)\s*\$?\s*"
            r"([\d,]+(?:\.\d+)?|—)\s*$"
        )

        match = re.match(grade_pattern, line)
        if match:
            return PositionEntry(
                department=department,
                division=division,
                title=match.group(1).strip(),
                fte_2025=self._parse_amount(match.group(2)),
                grade=match.group(3) if not match.group(3).replace(",", "").isdigit() else None,
                hours_months_2025=match.group(4),
                budget_2025=self._parse_amount(match.group(5)),
                fte_2026=self._parse_amount(match.group(6)),
                hours_months_2026=match.group(8),
                budget_2026=self._parse_amount(match.group(9)),
                position_type=position_type,
            )

        # Simpler pattern for hourly workers:
        # "Laborer 18 24.47 2,080 916,157 18 24.96 2,080 934,502"
        hourly_pattern = (
            r"^(.+?)\s+"
            r"([\d.]+|—)\s+"
            r"([\d.]+)\s+"
            r"([\d,]+)\s+"
            r"([\d,]+(?:\.\d+)?|—)\s+"
            r"([\d.]+|—)\s+"
            r"([\d.]+)\s+"
            r"([\d,]+)\s+"
            r"([\d,]+(?:\.\d+)?|—)\s*$"
        )

        match = re.match(hourly_pattern, line)
        if match:
            return PositionEntry(
                department=department,
                division=division,
                title=match.group(1).strip(),
                fte_2025=self._parse_amount(match.group(2)),
                grade=f"${match.group(3)}/hr",
                hours_months_2025=match.group(4),
                budget_2025=self._parse_amount(match.group(5)),
                fte_2026=self._parse_amount(match.group(6)),
                hours_months_2026=match.group(8),
                budget_2026=self._parse_amount(match.group(9)),
                position_type=position_type,
            )

        return None

    def _update_totals(
        self, metadata: FundMetadata, budget_lines: list[BudgetLineItem]
    ) -> None:
        """Update metadata totals from parsed budget lines."""
        for item in budget_lines:
            if item.line_type != "total":
                continue

            if "Revenues" in (item.subclass_name or ""):
                metadata.revenues_total_2025 = item.budget_2025
                metadata.revenues_total_2026 = item.budget_2026
            elif "Expenditures" in (item.subclass_name or ""):
                metadata.expenditures_total_2025 = item.budget_2025
                metadata.expenditures_total_2026 = item.budget_2026
            elif "Net" in (item.subclass_name or ""):
                metadata.net_total_2025 = item.budget_2025
                metadata.net_total_2026 = item.budget_2026

    def _is_skip_line(self, line: str) -> bool:
        """Check if line should be skipped (headers, footers, etc.)."""
        skip_patterns = [
            r"^\d+$",  # Page numbers
            r"^City of Pittsburgh Operating Budget",
            r"^Fiscal Year 2026",
            r"^Subclass",
            r"^2025\s+2026",
            r"^Budget\s+Budget",
            r"^Projected",
            r"^Department:",
            r"^Authorizing",
            r"^Description:",
            r"^Revenues:",
            r"^Expenditures:",
            r"^Position Summary",
            r"^Title\s+FTE",
            r"^Totals may not sum",
            r"^File \d{4}-\d+",
            r"^Resolution",
            r"^Be it resolved",
            r"^Section \d+",
        ]

        for pattern in skip_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                return True
        return False

    def _extract_pattern(
        self, pattern: str, text: str, flags: int = 0
    ) -> str | None:
        """Extract first match of pattern from text."""
        match = re.search(pattern, text, flags)
        return match.group(1) if match else None

    def _extract_amount(self, pattern: str, text: str) -> float | None:
        """Extract and parse a dollar amount from text using pattern."""
        match = re.search(pattern, text)
        if match:
            return self._parse_amount(match.group(1))
        return None

    def _parse_amount(self, value: str | None) -> float | None:
        """Parse a string amount into a float."""
        if not value or value == "—":
            return None

        # Handle negative amounts in parentheses
        is_negative = value.startswith("(") and value.endswith(")")
        if is_negative:
            value = value[1:-1]

        # Remove $ and commas
        cleaned = value.replace("$", "").replace(",", "").replace(" ", "").strip()

        try:
            amount = float(cleaned)
            return -amount if is_negative else amount
        except ValueError:
            return None

    def _parse_percent(self, value: str | None) -> float | None:
        """Parse a percentage string into a float."""
        if not value or value in ("—", "—%"):
            return None

        # Handle negative percentages in parentheses
        is_negative = "(" in value
        cleaned = value.replace("(", "").replace(")", "").replace("%", "").strip()

        try:
            pct = float(cleaned)
            return -pct if is_negative else pct
        except ValueError:
            return None

    def _clean_text(self, text: str | None) -> str | None:
        """Clean extracted text, normalizing whitespace."""
        if not text:
            return None

        # Replace multiple whitespace with single space
        cleaned = re.sub(r"\s+", " ", text)
        return cleaned.strip() or None
