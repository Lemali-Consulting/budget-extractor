"""Tests for year-agnostic section detection."""
from __future__ import annotations

import pytest

from scripts.derive_sections import detect_section_start

LONG_BODY: str = "x" * 200


@pytest.mark.parametrize("year", [2025, 2026, 2027])
def test_salary_tables_detected_for_any_year(year: int) -> None:
    page_text: str = f"{year} Salary Tables\n{LONG_BODY}\nrow\nrow\nrow\nrow"
    assert detect_section_start(page_text, 1) == "Salary Tables"
