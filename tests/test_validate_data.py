"""Tests for output-prefix resolution in the data validator."""
from __future__ import annotations

from scripts.validate_data import bundle_prefix
from utils.paths import DEFAULT_YEAR


def test_default_year_has_no_prefix() -> None:
    assert bundle_prefix(year=DEFAULT_YEAR, override=None) == ""


def test_other_years_get_year_prefix_by_default() -> None:
    assert bundle_prefix(year=DEFAULT_YEAR - 1, override=None) == f"{DEFAULT_YEAR - 1}-"


def test_explicit_prefix_wins_and_is_dash_terminated() -> None:
    assert bundle_prefix(year=DEFAULT_YEAR, override="scratch2027") == "scratch2027-"


def test_explicit_empty_prefix_means_unprefixed() -> None:
    assert bundle_prefix(year=DEFAULT_YEAR - 1, override="") == ""
