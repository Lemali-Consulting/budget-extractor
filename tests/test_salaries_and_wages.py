"""Tests for the citywide salaries-and-wages figure the home page and dashboard headline, read from the PDF's Expenditure Summary."""
import importlib.util
import types


def _mod() -> types.ModuleType:
    """Import build_web_data as a module, handling the script-style layout."""
    spec = importlib.util.spec_from_file_location(
        "build_web_data", "scripts/build_web_data.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _expenditure_summary(mod: types.ModuleType, *, current: str, prior: str) -> dict:
    """An Expenditure Summary section laid out like the 2027 PDF, p. 45."""
    by, py = mod.BUDGET_YEAR, mod.PRIOR_YEAR
    headers = ["Expenditures", f"{py - 1} Actual", f"{py} Budget", f"{by} Budget", "Increase/ (Decrease)", "% Change"]
    return {
        "title": "Expenditure Summary",
        "slug": "expenditure-summary",
        "start_page": 44,
        "tables": [
            {
                "headers": headers,
                "absolute_page": 45,
                "rows": [
                    ["51 - Personnel-Salaries & Wages", "294,034,947", prior, current, "18,037,295", "5.8%"],
                    ["52 - Personnel-Employee Benefits", "1", "2", "3", "1", "1%"],
                ],
            }
        ],
    }


def test_reads_printed_salaries_and_wages_line():
    """The headline salary figure is the General Fund's printed "51 - Personnel-Salaries & Wages" line.

    Public Source's fact-checkers compare the home page against the Operating
    Budget's expenditure summary, so the site shows that exact figure, with
    the page it comes from, rather than a sum we compute.
    """
    mod = _mod()
    view = mod.build_salaries_and_wages([_expenditure_summary(mod, current="328,169,672", prior="310,132,377")])
    assert view == {
        "current": 328_169_672,
        "prior": 310_132_377,
        "page": 45,
        "sectionSlug": "expenditure-summary",
    }


def test_missing_line_yields_none():
    """A budget document without the summary line gives no figure, so the site can fall back instead of showing $0."""
    mod = _mod()
    assert mod.build_salaries_and_wages([]) is None
