"""Tests for variant-aware path resolution (capital variants, best-variant sections selection)."""
from __future__ import annotations

from pathlib import Path

import pytest

from utils import paths


@pytest.fixture
def fake_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the paths module at an empty project root."""
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    return tmp_path


def _touch_sections(root: Path, year: int, subtype: str) -> Path:
    path: Path = root / "input" / str(year) / f"sections-{subtype}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("[]")
    return path


def test_variant_paths_adopted_uses_plain_capital(fake_root: Path) -> None:
    vp = paths.variant_paths(year=2026, budget_type="capital", variant="adopted")
    assert vp.subtype == "capital"
    assert vp.pdf == fake_root / "input/2026/capital-budget.pdf"
    assert vp.sections == fake_root / "input/2026/sections-capital.json"
    assert vp.split_dir == fake_root / "input/2026/split-pdf/capital"
    assert vp.expected_dir == fake_root / "output/regression/expected/2026/capital"


def test_variant_paths_proposed_capital(fake_root: Path) -> None:
    vp = paths.variant_paths(year=2027, budget_type="capital", variant="proposed")
    assert vp.subtype == "capital-proposed"
    assert vp.pdf == fake_root / "input/2027/capital-proposed-budget.pdf"
    assert vp.sections == fake_root / "input/2027/sections-capital-proposed.json"
    assert vp.split_dir == fake_root / "input/2027/split-pdf/capital-proposed"
    assert vp.expected_dir == fake_root / "output/regression/expected/2027/capital-proposed"


def test_best_sections_prefers_adopted_over_amended(fake_root: Path) -> None:
    adopted: Path = _touch_sections(fake_root, 2026, "operating")
    _touch_sections(fake_root, 2026, "operating-amended")
    assert paths.best_sections_path(2026, "operating") == adopted


def test_best_sections_prefers_amended_over_proposed(fake_root: Path) -> None:
    amended: Path = _touch_sections(fake_root, 2026, "operating-amended")
    _touch_sections(fake_root, 2026, "operating-proposed")
    assert paths.best_sections_path(2026, "operating") == amended


def test_best_sections_falls_back_to_proposed(fake_root: Path) -> None:
    proposed: Path = _touch_sections(fake_root, 2027, "operating-proposed")
    assert paths.best_sections_path(2027, "operating") == proposed
    assert paths.best_variant_type(2027, "operating") == "operating-proposed"


def test_best_sections_none_when_missing(fake_root: Path) -> None:
    assert paths.best_sections_path(2030, "capital") is None
    assert paths.best_variant_type(2030, "capital") is None
