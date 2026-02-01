"""PDF loading and page iteration."""

from pathlib import Path
from typing import Iterator
from contextlib import contextmanager

import pdfplumber
from pdfplumber.page import Page


class PDFReader:
    """Handles PDF loading and page-by-page iteration."""

    def __init__(self, pdf_path: str | Path):
        self.pdf_path = Path(pdf_path)
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"PDF not found: {self.pdf_path}")
        self._pdf = None

    @contextmanager
    def open(self):
        """Context manager for opening the PDF."""
        self._pdf = pdfplumber.open(self.pdf_path)
        try:
            yield self
        finally:
            self._pdf.close()
            self._pdf = None

    @property
    def total_pages(self) -> int:
        """Get total number of pages in the PDF."""
        if self._pdf is None:
            raise RuntimeError("PDF not opened. Use 'with reader.open():'")
        return len(self._pdf.pages)

    @property
    def metadata(self) -> dict:
        """Get PDF metadata."""
        if self._pdf is None:
            raise RuntimeError("PDF not opened. Use 'with reader.open():'")
        return self._pdf.metadata or {}

    def iterate_pages(self) -> Iterator[tuple[int, Page]]:
        """
        Iterate over pages one at a time (memory efficient).

        Yields:
            Tuple of (page_number, page_object) where page_number is 1-indexed.
        """
        if self._pdf is None:
            raise RuntimeError("PDF not opened. Use 'with reader.open():'")

        for i, page in enumerate(self._pdf.pages):
            yield i + 1, page

    def get_page(self, page_number: int) -> Page:
        """
        Get a specific page (1-indexed).

        Args:
            page_number: Page number (1-indexed)

        Returns:
            The page object
        """
        if self._pdf is None:
            raise RuntimeError("PDF not opened. Use 'with reader.open():'")

        if page_number < 1 or page_number > self.total_pages:
            raise ValueError(f"Page {page_number} out of range (1-{self.total_pages})")

        return self._pdf.pages[page_number - 1]
