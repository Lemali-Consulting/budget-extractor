"""Tests for source-PDF label corrections: loading, applying, and their effect on the 2027 Parks Tax view."""
from __future__ import annotations

import importlib.util
import json
import types
from pathlib import Path

import pytest

from utils import corrections, paths

PARKS_SECTION: str = "Parks Tax Trust Fund"
OLD_HEADERS: list[str] = ["Subclass", "2025 Budget", "2026 Budget", "Increase/ (Decrease)"]
PERSONNEL_HEADERS: list[str] = ["Title", "2026 FTE", "2026 Budget", "2027 FTE", "2027 Budget"]
CORRECTION_ID: str = "parks-year-labels"


def _correction_json(**overrides: object) -> dict:
    entry: dict = {
        "id": CORRECTION_ID,
        "section": PARKS_SECTION,
        "whenHeaders": ["2025 Budget", "2026 Budget"],
        "headerRenames": {"2025 Budget": "2026 Budget", "2026 Budget": "2027 Budget"},
        "summary": "Relabelled by us.",
        "evidence": "Figures match.",
        "pdfPage": 154,
    }
    entry.update(overrides)
    return entry


def _write(tmp_path: Path, *entries: dict) -> Path:
    path: Path = tmp_path / "corrections.json"
    path.write_text(json.dumps({"corrections": list(entries)}))
    return path


def _sections() -> list[dict]:
    return [
        {
            "title": PARKS_SECTION,
            "slug": "parks-tax-trust-fund",
            "tables": [
                {"id": "s35_p0_t1", "headers": list(OLD_HEADERS), "rows": []},
                {"id": "s35_p1_t0", "headers": list(PERSONNEL_HEADERS), "rows": []},
            ],
        },
        {
            "title": "Other",
            "slug": "other",
            "tables": [{"id": "s1_p0_t0", "headers": list(OLD_HEADERS), "rows": []}],
        },
    ]


def test_corrections_path_uses_subtype() -> None:
    assert paths.corrections_path(2027, "operating-proposed") == (
        paths.PROJECT_ROOT / "input" / "2027" / "corrections-operating-proposed.json"
    )


def test_missing_file_means_no_corrections(tmp_path: Path) -> None:
    assert corrections.load_corrections(tmp_path / "nope.json") == []


def test_load_reads_every_field(tmp_path: Path) -> None:
    (loaded,) = corrections.load_corrections(_write(tmp_path, _correction_json()))
    assert loaded.id == CORRECTION_ID
    assert loaded.section == PARKS_SECTION
    assert loaded.when_headers == ("2025 Budget", "2026 Budget")
    assert loaded.header_renames == {"2025 Budget": "2026 Budget", "2026 Budget": "2027 Budget"}
    assert loaded.pdf_page == 154


def test_renames_apply_simultaneously_not_sequentially(tmp_path: Path) -> None:
    sections: list[dict] = _sections()
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json()))
    corrections.apply_corrections(sections=sections, corrections=loaded)
    assert sections[0]["tables"][0]["headers"] == ["Subclass", "2026 Budget", "2027 Budget", "Increase/ (Decrease)"]


def test_only_matching_tables_in_the_named_section_change(tmp_path: Path) -> None:
    sections: list[dict] = _sections()
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json()))
    corrections.apply_corrections(sections=sections, corrections=loaded)
    assert sections[0]["tables"][1]["headers"] == PERSONNEL_HEADERS
    assert sections[1]["tables"][0]["headers"] == OLD_HEADERS
    assert "corrections" not in sections[0]["tables"][1]
    assert "corrections" not in sections[1]


def test_tables_and_section_carry_correction_refs(tmp_path: Path) -> None:
    sections: list[dict] = _sections()
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json()))
    corrections.apply_corrections(sections=sections, corrections=loaded)
    ref: dict = {"id": CORRECTION_ID, "summary": "Relabelled by us."}
    assert sections[0]["tables"][0]["corrections"] == [ref]
    assert sections[0]["corrections"] == [ref]


def test_report_lists_original_and_corrected_headers(tmp_path: Path) -> None:
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json()))
    (entry,) = corrections.apply_corrections(sections=_sections(), corrections=loaded)
    assert entry == {
        "id": CORRECTION_ID,
        "section": PARKS_SECTION,
        "sectionSlug": "parks-tax-trust-fund",
        "tableId": "s35_p0_t1",
        "summary": "Relabelled by us.",
        "evidence": "Figures match.",
        "pdfPage": 154,
        "originalHeaders": OLD_HEADERS,
        "correctedHeaders": ["Subclass", "2026 Budget", "2027 Budget", "Increase/ (Decrease)"],
    }


def test_correction_matching_no_table_raises(tmp_path: Path) -> None:
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json(whenHeaders=["1999 Budget"])))
    with pytest.raises(corrections.CorrectionError, match=CORRECTION_ID):
        corrections.apply_corrections(sections=_sections(), corrections=loaded)


def test_correction_for_unknown_section_raises(tmp_path: Path) -> None:
    loaded = corrections.load_corrections(_write(tmp_path, _correction_json(section="Nowhere")))
    with pytest.raises(corrections.CorrectionError, match=CORRECTION_ID):
        corrections.apply_corrections(sections=_sections(), corrections=loaded)


def _build_module() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("build_web_data", "scripts/build_web_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.BUDGET_YEAR = 2027
    mod.PRIOR_YEAR = 2026
    return mod


def _real_parks_section(mod: types.ModuleType) -> dict:
    """The Parks Tax section built from the real 2027 proposed baseline CSV (financial table only)."""
    csv_path: Path = (
        paths.expected_dir(2027, "operating-proposed") / "35_Parks_Tax_Trust_Fund" / "P0T1.csv"
    )
    parsed: dict = mod.parse_csv(csv_path)
    headers: list[str] = mod.fill_blank_year_headers(parsed["headers"], 2027)
    table: dict = {
        "id": "s35_p0_t1",
        "table_type": mod.classify_table(headers, section_title=PARKS_SECTION),
        "headers": headers,
        "rows": parsed["rows"],
    }
    return {"title": PARKS_SECTION, "slug": "parks-tax-trust-fund", "tables": [table]}


def _parks_amounts(rows: list[dict]) -> dict[str, float]:
    return {r["year"]: r["amount"] for r in rows if r["slug"] == "parks-tax-trust-fund"}


def test_real_2027_parks_tax_view_gains_2027_row() -> None:
    mod = _build_module()
    real_file: Path = paths.corrections_path(2027, "operating-proposed")
    loaded = corrections.load_corrections(real_file)
    assert [c.id for c in loaded] == ["parks-tax-trust-fund-year-labels"]

    uncorrected: dict[str, float] = _parks_amounts(mod.build_department_budgets([_real_parks_section(mod)]))
    assert "2027 Budget" not in uncorrected

    sections: list[dict] = [_real_parks_section(mod)]
    corrections.apply_corrections(sections=sections, corrections=loaded)
    amounts: dict[str, float] = _parks_amounts(mod.build_department_budgets(sections))
    assert amounts["2027 Budget"] == 9_355_441
    assert amounts["2026 Budget"] == 9_505_063
