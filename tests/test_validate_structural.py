"""Tests that the structural validator counts a table's columns correctly when the table carries a section column."""
from pathlib import Path

from scripts.validate_data import Finding, validate_csv_structural

GEOMETRY_WITH_SECTION: str = '"C0 (l, x:20-128)","C1 (l, x:128-228)","C2 (r, x:228-291)",section\n'
MISMATCH_TEXT: str = "header has"


def _mismatch_findings(*, tmp_path: Path, body: str) -> list[Finding]:
    """Structural findings about header/data column mismatches for a CSV built from ``body``."""
    csv_path: Path = tmp_path / "P0T0.csv"
    csv_path.write_text(GEOMETRY_WITH_SECTION + body)
    return [f for f in validate_csv_structural(csv_path, "00_Test", 2027) if MISMATCH_TEXT in f.message]


def test_headerless_table_with_blank_section_cell_is_not_a_mismatch(tmp_path: Path) -> None:
    """A headerless table's first row is data; its empty section cell is not an extra column."""
    body: str = 'Fund A,Project A,"62,100",\nFund A,Project B,"508,000",\n'

    assert _mismatch_findings(tmp_path=tmp_path, body=body) == []


def test_headed_table_with_section_header_is_not_a_mismatch(tmp_path: Path) -> None:
    """A header row ending in the "section" label matches the geometry."""
    body: str = 'Fund,Project,Amount,section\nFund A,Project A,"62,100",Fund A\n'

    assert _mismatch_findings(tmp_path=tmp_path, body=body) == []


def test_header_wider_than_geometry_is_still_reported(tmp_path: Path) -> None:
    """A header row with more cells than detected columns is still an error."""
    body: str = 'Fund,Project,Amount,Extra,section\nFund A,Project A,"62,100",Fund A\n'

    assert len(_mismatch_findings(tmp_path=tmp_path, body=body)) == 1
