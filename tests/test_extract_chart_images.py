"""Tests for per-year/variant PDF selection in the chart image extractor."""
from __future__ import annotations

from pathlib import Path

import pytest

from scripts.extract_chart_images import resolve_source_pdf
from utils import paths


@pytest.fixture
def fake_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    (tmp_path / "input" / "2026").mkdir(parents=True)
    return tmp_path


def _pdf(root: Path, name: str) -> Path:
    path: Path = root / "input" / "2026" / name
    path.write_bytes(b"")
    return path


def test_explicit_variant_is_used(fake_root: Path) -> None:
    _pdf(fake_root, "operating-budget.pdf")
    proposed: Path = _pdf(fake_root, "operating-proposed-budget.pdf")
    assert resolve_source_pdf(year=2026, budget_type="operating", variant="proposed") == proposed


def test_unspecified_variant_prefers_amended_then_adopted(fake_root: Path) -> None:
    adopted: Path = _pdf(fake_root, "operating-budget.pdf")
    assert resolve_source_pdf(year=2026, budget_type="operating", variant=None) == adopted
    amended: Path = _pdf(fake_root, "operating-amended-budget.pdf")
    assert resolve_source_pdf(year=2026, budget_type="operating", variant=None) == amended


def test_unspecified_variant_falls_back_to_proposed(fake_root: Path) -> None:
    proposed: Path = _pdf(fake_root, "capital-proposed-budget.pdf")
    assert resolve_source_pdf(year=2026, budget_type="capital", variant=None) == proposed
