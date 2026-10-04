"""Tests that the web build lists every defined section, including text-only ones with no baseline folder."""
import importlib
import types
from pathlib import Path


def _import_build_web_data() -> types.ModuleType:
    """Import build_web_data as a module, handling the script-style layout."""
    spec = importlib.util.spec_from_file_location("build_web_data", "scripts/build_web_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SECTIONS_LOOKUP: dict[int, dict] = {
    1: {"title": "Budget Guide", "start_page": 1, "end_page": 2},
    2: {"title": "Revenue Narrative", "start_page": 3, "end_page": 4},
    3: {"title": "Revenue Summary", "start_page": 5, "end_page": 6},
}


def test_text_only_section_without_baseline_folder_is_listed(tmp_path: Path) -> None:
    """A section with no baseline folder (git can't store empty folders) still gets an entry, with no tables."""
    mod: types.ModuleType = _import_build_web_data()
    (tmp_path / "01_Budget_Guide").mkdir()
    (tmp_path / "03_Revenue_Summary").mkdir()

    listing: list[tuple[int, Path | None]] = mod.section_table_dirs(
        sections_lookup=SECTIONS_LOOKUP, output_dir=tmp_path
    )

    assert listing == [
        (1, tmp_path / "01_Budget_Guide"),
        (2, None),
        (3, tmp_path / "03_Revenue_Summary"),
    ]


def test_baseline_folder_for_an_undefined_section_is_still_listed(tmp_path: Path) -> None:
    """A baseline folder beyond the section definitions keeps its entry, as before."""
    mod: types.ModuleType = _import_build_web_data()
    (tmp_path / "04_Extra").mkdir()
    (tmp_path / "notes.txt").write_text("not a section")

    listing: list[tuple[int, Path | None]] = mod.section_table_dirs(
        sections_lookup=SECTIONS_LOOKUP, output_dir=tmp_path
    )

    assert listing == [(1, None), (2, None), (3, None), (4, tmp_path / "04_Extra")]
