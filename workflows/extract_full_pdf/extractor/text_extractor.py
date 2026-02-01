"""Text extraction and cleanup from PDF pages."""

import re
from pdfplumber.page import Page

from .table_extractor import TableExtractor


class TextExtractor:
    """Extract and clean text from PDF pages."""

    # Patterns for section headers (common budget document patterns)
    SECTION_PATTERNS = [
        re.compile(r'^(?:SECTION|CHAPTER|PART)\s+[\dIVXLCDM]+[:\.\s]', re.IGNORECASE),
        re.compile(r'^[A-Z][A-Z\s]{5,}$'),  # ALL CAPS headers
        re.compile(r'^\d+\.\s+[A-Z]'),  # Numbered sections like "1. Overview"
    ]

    def __init__(self, table_extractor: TableExtractor | None = None):
        self.table_extractor = table_extractor or TableExtractor()

    def extract_text(self, page: Page, exclude_tables: bool = True) -> str:
        """
        Extract text from a page.

        Args:
            page: pdfplumber page object
            exclude_tables: If True, exclude text that's inside table areas

        Returns:
            Extracted text as string
        """
        if exclude_tables:
            return self._extract_text_outside_tables(page)
        else:
            return page.extract_text() or ""

    def _extract_text_outside_tables(self, page: Page) -> str:
        """Extract text from page, excluding table regions."""
        # Get table bounding boxes
        table_boxes = self.table_extractor.get_table_bounding_boxes(page)

        if not table_boxes:
            # No tables, extract all text
            return page.extract_text() or ""

        # Get all characters/words
        words = page.extract_words()

        # Filter out words inside table regions
        filtered_words = []
        for word in words:
            if not self._is_in_any_box(word, table_boxes):
                filtered_words.append(word)

        # Reconstruct text from filtered words
        if not filtered_words:
            return ""

        return self._words_to_text(filtered_words)

    def _is_in_any_box(self, word: dict, boxes: list[tuple]) -> bool:
        """Check if a word is inside any of the bounding boxes."""
        word_x = (word['x0'] + word['x1']) / 2
        word_y = (word['top'] + word['bottom']) / 2

        for box in boxes:
            x0, top, x1, bottom = box
            if x0 <= word_x <= x1 and top <= word_y <= bottom:
                return True
        return False

    def _words_to_text(self, words: list[dict]) -> str:
        """Convert list of word dictionaries to text."""
        if not words:
            return ""

        # Sort by position (top to bottom, left to right)
        sorted_words = sorted(words, key=lambda w: (w['top'], w['x0']))

        lines = []
        current_line = []
        current_top = None
        line_threshold = 5  # pixels tolerance for same line

        for word in sorted_words:
            if current_top is None:
                current_top = word['top']
                current_line = [word['text']]
            elif abs(word['top'] - current_top) <= line_threshold:
                current_line.append(word['text'])
            else:
                lines.append(' '.join(current_line))
                current_line = [word['text']]
                current_top = word['top']

        if current_line:
            lines.append(' '.join(current_line))

        return '\n'.join(lines)

    def extract_full_text(self, page: Page) -> str:
        """Extract all text from page including tables."""
        return page.extract_text() or ""

    def find_section_headers(self, text: str) -> list[tuple[str, int]]:
        """
        Find section headers in text.

        Args:
            text: Text to search

        Returns:
            List of (header_text, line_number) tuples
        """
        headers = []
        lines = text.split('\n')

        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            for pattern in self.SECTION_PATTERNS:
                if pattern.match(line):
                    headers.append((line, i))
                    break

        return headers

    def clean_text(self, text: str) -> str:
        """
        Clean and normalize extracted text.

        Args:
            text: Raw extracted text

        Returns:
            Cleaned text
        """
        if not text:
            return ""

        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')

        # Remove excessive blank lines
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Normalize spaces
        lines = []
        for line in text.split('\n'):
            # Collapse multiple spaces but preserve indentation
            cleaned = re.sub(r' {2,}', ' ', line.rstrip())
            lines.append(cleaned)

        return '\n'.join(lines)
