"""Tests for year-agnostic helpers of the capital appendices parser."""
from __future__ import annotations

from pathlib import Path

import pytest

from utils.capital_appendices import find_appendix_pdf, is_projects_title_row


@pytest.mark.parametrize("text", ["2026 Projects by Department", "2027 Projects by Department", "2031 Projects"])
def test_title_row_matches_any_year(text: str) -> None:
    assert is_projects_title_row(text)


@pytest.mark.parametrize("text", ["CITY COUNCIL", "Projects by Department", "Project Name", "26 Projects"])
def test_title_row_rejects_non_titles(text: str) -> None:
    assert not is_projects_title_row(text)


def test_find_appendix_pdf_discovers_by_glob(tmp_path: Path) -> None:
    (tmp_path / "67_SENIOR_COMMUNITY_PROGRAM.pdf").write_bytes(b"")
    expected: Path = tmp_path / "68_Capital_Budget_Appendices.pdf"
    expected.write_bytes(b"")
    assert find_appendix_pdf(tmp_path) == expected


def test_find_appendix_pdf_errors_when_none(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Capital_Budget_Appendices"):
        find_appendix_pdf(tmp_path)


def test_find_appendix_pdf_errors_when_multiple(tmp_path: Path) -> None:
    (tmp_path / "64_Capital_Budget_Appendices.pdf").write_bytes(b"")
    (tmp_path / "68_Capital_Budget_Appendices.pdf").write_bytes(b"")
    with pytest.raises(ValueError, match="Multiple"):
        find_appendix_pdf(tmp_path)


# ----- Data-page discovery (page layout differs between years) -----

from utils.capital_appendices import locate_appendix_pages

COVER_WORDS = 4
DATA_WORDS = 200


def test_locate_pages_2026_layout() -> None:
    pages: list[tuple[str, int]] = [
        ("161", 1),
        ("Appendix A: Projects by\nDepartment", COVER_WORDS),
        ("2026 Projects by Department", DATA_WORDS),
        ("2026 Projects by Department", DATA_WORDS),
        ("165", 1),
        ("Appendix B: CPFC Scoring\n166", COVER_WORDS),
        ("Adjusted", DATA_WORDS),
        ("Adjusted", DATA_WORDS),
        ("171", 1),
        ("Appendix C: Glossary\n172", COVER_WORDS),
        ("ACRONYM", DATA_WORDS),
        ("176", 1),
        ("Appendix D: Parks Tax\n178", COVER_WORDS),
        ("2026 Parks Tax Funded Projects", DATA_WORDS),
    ]
    found: dict[str, list[int]] = locate_appendix_pages(pages)
    assert found["A"] == [2, 3]
    assert found["B"] == [6, 7]
    assert found["C"] == [10]
    assert found["D"] == [13]


def test_locate_pages_2027_layout_skips_blank_pages() -> None:
    pages: list[tuple[str, int]] = [
        ("Appendix A: Projects by\nDepartment", COVER_WORDS),
        ("2027 Projects by Department", DATA_WORDS),
        ("", 0),
        ("Appendix B: CPFC Scoring", COVER_WORDS),
        ("Project Name Project Deliverable", DATA_WORDS),
        ("", 0),
        ("Appendix C: Glossary", COVER_WORDS),
        ("ACRONYM/TERM NAME DESCRIPTION", DATA_WORDS),
    ]
    found: dict[str, list[int]] = locate_appendix_pages(pages)
    assert found == {"A": [1], "B": [4], "C": [7]}
