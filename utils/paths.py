"""Centralized path configuration for multi-year budget data."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_YEAR = 2026


def input_dir(year: int = DEFAULT_YEAR) -> Path:
    """Root input directory for a budget year."""
    return PROJECT_ROOT / "input" / str(year)


def variant_type(budget_type: str, variant: str = "adopted") -> str:
    """Compose a budget type with a variant into a path-friendly subtype.

    The default "adopted" variant returns the plain budget type for
    backward compatibility (e.g. "operating"); other variants are appended
    (e.g. "operating-amended"). This lets every (year, budget_type) path
    helper hold a parallel variant without further changes.
    """
    return budget_type if variant in ("", "adopted") else f"{budget_type}-{variant}"


def pdf_path(year: int, budget_type: str) -> Path:
    """Full budget PDF for a year and type (operating/capital)."""
    return input_dir(year) / f"{budget_type}-budget.pdf"


def sections_path(year: int, budget_type: str) -> Path:
    """Section definitions JSON for a year and type."""
    return input_dir(year) / f"sections-{budget_type}.json"


def split_pdf_dir(year: int, budget_type: str) -> Path:
    """Directory of per-section split PDFs for a year and type."""
    return input_dir(year) / "split-pdf" / budget_type


def expected_dir(year: int | None = None, budget_type: str | None = None) -> Path:
    """Regression expected baselines directory.

    With no args: returns the root expected/ directory.
    With year: returns expected/{year}/.
    With year and budget_type: returns expected/{year}/{budget_type}/.
    """
    base = PROJECT_ROOT / "output" / "regression" / "expected"
    if year is not None:
        base = base / str(year)
    if budget_type is not None:
        base = base / budget_type
    return base


def debug_dir(year: int | None = None) -> Path:
    """Regression debug output directory.

    With no args: returns the root debug/ directory.
    With year: returns debug/{year}/.
    """
    base = PROJECT_ROOT / "output" / "regression" / "debug"
    if year is not None:
        base = base / str(year)
    return base


def glossary_path() -> Path:
    """Shared glossary JSON (not versioned per year)."""
    return PROJECT_ROOT / "output" / "glossary" / "glossary.json"


def web_data_dir() -> Path:
    """Web app data directory."""
    return PROJECT_ROOT / "web" / "src" / "data"


def available_years() -> list[int]:
    """Discover which budget years have input directories."""
    input_root = PROJECT_ROOT / "input"
    years = []
    for d in sorted(input_root.iterdir()):
        if d.is_dir() and d.name.isdigit():
            years.append(int(d.name))
    return years
