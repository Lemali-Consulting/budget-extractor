"""Parse dollar amounts from text."""

import re
from dataclasses import dataclass


@dataclass
class ParsedAmount:
    """A parsed dollar amount with its original text."""
    value: float
    original_text: str
    start_pos: int
    end_pos: int


class AmountParser:
    """Parse dollar amounts from text."""

    # Patterns for dollar amounts
    # Matches: $1,234,567.89, $1234.56, $1,234, ($1,234.56), -$1,234.56
    DOLLAR_PATTERN = re.compile(
        r'(?P<negative>\(|\-)?\s*'  # Optional negative indicator
        r'\$\s*'  # Dollar sign
        r'(?P<amount>[\d,]+(?:\.\d{1,2})?)'  # Amount with optional decimals
        r'\s*(?P<close_paren>\))?'  # Optional closing paren for negatives
    )

    # Pattern for amounts without dollar sign (in table context)
    NUMBER_PATTERN = re.compile(
        r'(?P<negative>\(|\-)?\s*'
        r'(?P<amount>\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)'
        r'\s*(?P<close_paren>\))?'
    )

    @classmethod
    def parse_dollar_amount(cls, text: str) -> float | None:
        """
        Parse a single dollar amount from text.

        Args:
            text: Text containing a dollar amount

        Returns:
            The parsed amount as a float, or None if not found
        """
        if not text:
            return None

        match = cls.DOLLAR_PATTERN.search(text)
        if match:
            return cls._extract_value(match)

        return None

    @classmethod
    def parse_numeric_amount(cls, text: str) -> float | None:
        """
        Parse a numeric amount (without dollar sign) from text.
        Useful for table cells that may not include $.

        Args:
            text: Text containing a number

        Returns:
            The parsed amount as a float, or None if not found
        """
        if not text:
            return None

        # Clean the text
        text = text.strip()

        match = cls.NUMBER_PATTERN.fullmatch(text)
        if match:
            return cls._extract_value(match)

        return None

    @classmethod
    def find_all_amounts(cls, text: str) -> list[ParsedAmount]:
        """
        Find all dollar amounts in text.

        Args:
            text: Text to search

        Returns:
            List of ParsedAmount objects
        """
        amounts = []
        for match in cls.DOLLAR_PATTERN.finditer(text):
            value = cls._extract_value(match)
            if value is not None:
                amounts.append(ParsedAmount(
                    value=value,
                    original_text=match.group(0),
                    start_pos=match.start(),
                    end_pos=match.end(),
                ))
        return amounts

    @classmethod
    def _extract_value(cls, match: re.Match) -> float | None:
        """Extract the numeric value from a regex match."""
        try:
            amount_str = match.group('amount').replace(',', '')
            value = float(amount_str)

            # Check for negative indicators
            is_negative = (
                match.group('negative') in ('(', '-') or
                match.group('close_paren') == ')'
            )

            if is_negative:
                value = -value

            return value
        except (ValueError, AttributeError):
            return None

    @classmethod
    def parse_cell_value(cls, cell: str | None) -> float | None:
        """
        Parse a table cell value, trying both dollar and numeric formats.

        Args:
            cell: Table cell content

        Returns:
            Parsed amount or None
        """
        if not cell:
            return None

        cell = str(cell).strip()

        # Try dollar format first
        amount = cls.parse_dollar_amount(cell)
        if amount is not None:
            return amount

        # Try numeric format
        return cls.parse_numeric_amount(cell)
