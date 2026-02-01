"""Shared parsing utilities for budget table PDFs (revenue and expenditure)."""

import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


@dataclass
class BudgetLineItem:
    """A single line item from a budget table."""
    account_code: str
    account_name: str
    year_2026: str
    year_2027: str
    year_2028: str
    year_2029: str
    year_2030: str
    is_section_header: bool = False


class BudgetTableParser:
    """Parses budget tables from PDF files with account code/amount structure."""

    def __init__(
        self,
        pdf_path: str | Path,
        header_patterns: list[str] | None = None,
        total_pattern: str | None = None,
    ):
        """
        Initialize the parser.

        Args:
            pdf_path: Path to the PDF file.
            header_patterns: Regex patterns for lines to skip (headers/footers).
            total_pattern: Regex pattern for the total line.
        """
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {self.pdf_path}")

        self.header_patterns = header_patterns or []
        self.total_pattern = total_pattern

    def extract_all_lines(self) -> list[BudgetLineItem]:
        """
        Extract all budget line items from the PDF.

        Returns:
            List of BudgetLineItem objects in document order.
        """
        all_items: list[BudgetLineItem] = []

        with pdfplumber.open(self.pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue

                items = self._parse_page_text(text)
                all_items.extend(items)

        return all_items

    def _parse_page_text(self, text: str) -> list[BudgetLineItem]:
        """Parse text from a single page into line items."""
        items: list[BudgetLineItem] = []
        lines = text.split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if self._is_header_or_footer(line):
                continue

            item = self._parse_budget_line(line)
            if item:
                items.append(item)

        return items

    def _is_header_or_footer(self, line: str) -> bool:
        """Check if line is a header, footer, or should be skipped."""
        default_patterns = [
            r'^\d+$',  # Page numbers
            r'^City of Pittsburgh Operating Budget',
            r'^Fiscal Year 2026',
        ]

        all_patterns = default_patterns + self.header_patterns

        for pattern in all_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                return True
        return False

    def _parse_budget_line(self, line: str) -> BudgetLineItem | None:
        """
        Parse a single line into a BudgetLineItem.

        Handles section headers (2-digit codes), detail lines (5-digit codes),
        and total lines.
        """
        # Pattern for section headers: "51 - PERSONNEL-SALARIES & WAGES $ 309,357,607 ..." or without $
        section_pattern = r'^(\d{2})\s*-\s*([A-Z&\s\-/]+?)\s+\$?\s*([\d,]+)\s+\$?\s*([\d,]+)\s+\$?\s*([\d,]+)\s+\$?\s*([\d,]+)\s+\$?\s*([\d,]+)\s*$'

        # Pattern for detail lines: "51101 - Description amount amount amount..."
        detail_pattern = r'^(\d{5})\s*-\s*(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$'

        # Try section header pattern
        match = re.match(section_pattern, line)
        if match:
            return BudgetLineItem(
                account_code=match.group(1),
                account_name=match.group(2).strip(),
                year_2026=self._clean_amount(match.group(3)),
                year_2027=self._clean_amount(match.group(4)),
                year_2028=self._clean_amount(match.group(5)),
                year_2029=self._clean_amount(match.group(6)),
                year_2030=self._clean_amount(match.group(7)),
                is_section_header=True,
            )

        # Try detail line pattern
        match = re.match(detail_pattern, line)
        if match:
            return BudgetLineItem(
                account_code=match.group(1),
                account_name=match.group(2).strip(),
                year_2026=self._clean_amount(match.group(3)),
                year_2027=self._clean_amount(match.group(4)),
                year_2028=self._clean_amount(match.group(5)),
                year_2029=self._clean_amount(match.group(6)),
                year_2030=self._clean_amount(match.group(7)),
                is_section_header=False,
            )

        # Try total pattern if provided
        if self.total_pattern:
            match = re.match(self.total_pattern, line)
            if match:
                return BudgetLineItem(
                    account_code="TOTAL",
                    account_name="Total",
                    year_2026=self._clean_amount(match.group(1)),
                    year_2027=self._clean_amount(match.group(2)),
                    year_2028=self._clean_amount(match.group(3)),
                    year_2029=self._clean_amount(match.group(4)),
                    year_2030=self._clean_amount(match.group(5)),
                    is_section_header=True,
                )

        return None

    def _clean_amount(self, value: str) -> str:
        """Clean an amount string, removing $ and extra spaces."""
        return value.replace('$', '').replace(' ', '').strip()

    def group_by_section(self, items: list[BudgetLineItem]) -> dict[str, list[BudgetLineItem]]:
        """
        Group line items by their section (2-digit prefix).

        Args:
            items: List of all extracted line items.

        Returns:
            Dictionary mapping section code to list of items in that section.
        """
        sections: dict[str, list[BudgetLineItem]] = {}

        for item in items:
            if item.account_code == "TOTAL":
                continue

            section_code = item.account_code[:2]

            if section_code not in sections:
                sections[section_code] = []

            sections[section_code].append(item)

        return sections
