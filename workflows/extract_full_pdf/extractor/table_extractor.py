"""Table detection and parsing from PDF pages."""

from pdfplumber.page import Page

from models.budget import BudgetTable, TableRow
from .amount_parser import AmountParser


class TableExtractor:
    """Extract and parse tables from PDF pages."""

    def __init__(self):
        self.amount_parser = AmountParser()

    def extract_tables(self, page: Page, page_number: int) -> list[BudgetTable]:
        """
        Extract all tables from a page.

        Args:
            page: pdfplumber page object
            page_number: 1-indexed page number

        Returns:
            List of BudgetTable objects
        """
        tables = []

        # Find tables on the page
        found_tables = page.find_tables()

        for table in found_tables:
            extracted = table.extract()
            if not extracted or len(extracted) < 1:
                continue

            budget_table = self._parse_table(extracted, page_number)
            if budget_table:
                tables.append(budget_table)

        return tables

    def _parse_table(self, raw_table: list[list], page_number: int) -> BudgetTable | None:
        """
        Parse raw table data into a BudgetTable.

        Args:
            raw_table: List of rows, each row is a list of cell values
            page_number: Page number for reference

        Returns:
            BudgetTable or None if table is empty/invalid
        """
        if not raw_table:
            return None

        # Clean all cells
        cleaned = []
        for row in raw_table:
            cleaned_row = [self._clean_cell(cell) for cell in row]
            cleaned.append(cleaned_row)

        if not cleaned:
            return None

        # First row is typically headers
        headers = cleaned[0]

        # Remaining rows are data
        rows = []
        for row_data in cleaned[1:]:
            # Pad row to match header length if needed
            while len(row_data) < len(headers):
                row_data.append("")
            rows.append(TableRow(cells=row_data))

        return BudgetTable(
            headers=headers,
            rows=rows,
            page=page_number,
        )

    def _clean_cell(self, cell) -> str:
        """Clean a table cell value."""
        if cell is None:
            return ""

        # Convert to string and clean
        text = str(cell).strip()

        # Normalize whitespace
        text = " ".join(text.split())

        return text

    def get_table_bounding_boxes(self, page: Page) -> list[tuple]:
        """
        Get bounding boxes of all tables on a page.
        Useful for excluding table areas from text extraction.

        Args:
            page: pdfplumber page object

        Returns:
            List of bounding box tuples (x0, top, x1, bottom)
        """
        boxes = []
        for table in page.find_tables():
            if table.bbox:
                boxes.append(table.bbox)
        return boxes

    def extract_amounts_from_table(self, table: BudgetTable) -> list[tuple[str, float]]:
        """
        Extract description-amount pairs from a table.
        Assumes first column is description and last numeric column is amount.

        Args:
            table: BudgetTable to process

        Returns:
            List of (description, amount) tuples
        """
        pairs = []

        for row in table.rows:
            if not row.cells:
                continue

            description = row.cells[0] if row.cells else ""

            # Find the last cell that parses as an amount
            amount = None
            for cell in reversed(row.cells[1:]):
                parsed = AmountParser.parse_cell_value(cell)
                if parsed is not None:
                    amount = parsed
                    break

            if description and amount is not None:
                pairs.append((description, amount))

        return pairs
