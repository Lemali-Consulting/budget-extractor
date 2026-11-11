"""Tests that department payroll totals match the PDF's "Net Salaries" line, not a raw sum of every row in a position table."""
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


def _position_table_section(mod: types.ModuleType) -> dict:
    """One department whose position table is laid out like the 2027 PDF (p. 153).

    Two full-time positions ($100,000 + $50,000), one part-time line ($10,000)
    listed under its subheading and then repeated as the part-time subtotal,
    and a vacancy allowance printed in parentheses. The PDF's "Total Full-Time
    Positions and Net Salaries" for this table is 100,000 + 50,000 + 10,000 -
    8,000 = 152,000.
    """
    prior, current = mod.PRIOR_YEAR, mod.BUDGET_YEAR
    headers = [
        "Title", f"{prior} FTE", "Rate/ Grade", "Hours/ Months", f"{prior} Budget",
        f"{current} FTE", "Rate/ Grade", "Hours/ Months", f"{current} Budget",
    ]
    rows = [
        ["Manager", "1", "28G", "12", "$ 95,000", "1", "28G", "12", "$ 100,000"],
        ["Coordinator", "1", "20G", "12", "48,000", "1", "20G", "12", "50,000"],
        ["Total Full-Time Permanent Positions", "2", "", "", "$ 143,000", "2", "", "", "$ 150,000"],
        ["Temporary, Part-Time, and Seasonal Allowances", "", "", "", "", "", "", "", ""],
        ["Program Coordinator", "—", "51.50", "—", "—", "—", "51.50", "1,050", "10,000"],
        ["Total Full-Time Permanent Positions", "2", "", "", "$ 143,000", "2", "", "", "$ 150,000"],
        ["Temporary, Part-Time, and Seasonal Allowances", "—", "", "", "—", "—", "", "", "10,000"],
        ["Vacancy Allowance", "—", "", "", "(5,000)", "—", "", "", "(8,000)"],
        ["Total Full-Time Positions and Net Salaries", "2", "", "", "$ 138,000", "2", "", "", "$ 152,000"],
    ]
    return {
        "title": "Example Department",
        "slug": "example-department",
        "tables": [{"table_type": "personnel", "headers": headers, "rows": rows}],
    }


def test_department_payroll_equals_net_salaries_line():
    """A department's payroll total equals the PDF's "Net Salaries" line.

    The homepage and dashboard "payroll" figure is the sum of these totals.
    Public Source's fact-check found it overstated: the vacancy allowance (a
    deduction for positions expected to sit empty) was being added, and the
    part-time subtotal was counted on top of the part-time lines it sums.
    """
    mod = _mod()
    personnel = mod.build_personnel([_position_table_section(mod)])
    [dept] = mod.build_personnel_by_department(personnel)
    assert dept["totalBudgetCurrent"] == 152_000
    assert dept["totalBudgetPrior"] == 138_000


def test_vacancy_allowance_is_a_deduction():
    """The vacancy allowance is kept as a negative amount, as the PDF prints it in parentheses."""
    mod = _mod()
    personnel = mod.build_personnel([_position_table_section(mod)])
    [vacancy] = [r for r in personnel if r["title"] == "Vacancy Allowance"]
    assert vacancy["budgetCurrent"] == -8_000


def _section(mod: types.ModuleType, rows: list[list[str]]) -> dict:
    """A one-table department with the standard position-table headers."""
    prior, current = mod.PRIOR_YEAR, mod.BUDGET_YEAR
    headers = [
        "Title", f"{prior} FTE", "Rate/ Grade", "Hours/ Months", f"{prior} Budget",
        f"{current} FTE", "Rate/ Grade", "Hours/ Months", f"{current} Budget",
    ]
    return {"title": "Example", "slug": "example", "tables": [{"table_type": "personnel", "headers": headers, "rows": rows}]}


def test_part_time_subtotal_with_another_label_is_not_double_counted():
    """City Council (2027, p. 63) labels its part-time subtotal "Temporary, Part-Time, and Interns".

    It still repeats the itemized intern line, so it must be skipped like the
    usual "... and Seasonal Allowances" label.
    """
    mod = _mod()
    rows = [
        ["Member of Council", "9", "92,269", "12", "830,421", "9", "95,035", "12", "855,317"],
        ["Total Full-Time Permanent Positions", "9", "", "", "830,421", "9", "", "", "855,317"],
        ["Temporary, Part-Time, and Seasonal Allowances", "", "", "", "", "", "", "", ""],
        ["Administrative/Research/Interns", "—", "varies", "—", "65,997", "—", "varies", "—", "65,997"],
        ["Total Full-Time Permanent Positions", "9", "", "", "830,421", "9", "", "", "855,317"],
        ["Temporary, Part-Time, and Interns", "—", "", "", "65,997", "—", "", "", "65,997"],
        ["Vacancy Allowance", "—", "", "", "(74,307)", "—", "", "", "—"],
        ["Total Full-Time Positions and Net Salaries", "9", "", "", "822,111", "9", "", "", "921,314"],
    ]
    personnel = mod.build_personnel([_section(mod, rows)])
    [dept] = mod.build_personnel_by_department(personnel)
    assert dept["totalBudgetCurrent"] == 921_314
    assert dept["totalBudgetPrior"] == 822_111


def test_part_time_line_without_itemization_is_counted():
    """The City Clerk (2027) lists part-time pay only as one summary line, with no itemized lines above it.

    That line is then the only record of the pay, so it must count.
    """
    mod = _mod()
    rows = [
        ["City Clerk", "1", "35G", "12", "132,995", "1", "35G", "12", "136,989"],
        ["Total Full-Time Permanent Positions", "1", "", "", "132,995", "1", "", "", "136,989"],
        ["Temporary, Part-Time, and Seasonal Allowances", "—", "varies", "", "30,575", "—", "varies", "", "30,575"],
        ["Vacancy Allowance", "—", "", "", "—", "—", "", "", "—"],
        ["Total Full-Time Positions and Net Salaries", "1", "", "", "163,570", "1", "", "", "167,564"],
    ]
    personnel = mod.build_personnel([_section(mod, rows)])
    [dept] = mod.build_personnel_by_department(personnel)
    assert dept["totalBudgetCurrent"] == 167_564


def test_wrapped_subtotal_label_is_not_counted_as_a_position():
    """A division subtotal whose label wraps onto a second line is still a subtotal.

    The 2025 Mayor's Office table prints "Total Office of Immigrant and
    Refugee" on one line and "Affairs" with the amounts on the next; that
    second line must not be counted as a position named "Affairs".
    """
    mod = _mod()
    rows = [
        ["Policy Coordinator", "1", "17G", "12", "58,352", "1", "18G", "12", "62,670"],
        ["Total Office of Immigrant and Refugee", "", "", "", "", "", "", "", ""],
        ["Affairs", "1", "", "", "58,352", "1", "", "", "62,670"],
        ["Total Full-Time Permanent Positions", "1", "", "", "58,352", "1", "", "", "62,670"],
        ["Total Full-Time Positions and Net Salaries", "1", "", "", "58,352", "1", "", "", "62,670"],
    ]
    personnel = mod.build_personnel([_section(mod, rows)])
    assert [r["title"] for r in personnel] == ["Policy Coordinator"]
    [dept] = mod.build_personnel_by_department(personnel)
    assert dept["totalFteCurrent"] == 1


def test_full_time_equivalents_unchanged():
    """FTE counts come only from positions; the allowance rows carry none."""
    mod = _mod()
    personnel = mod.build_personnel([_position_table_section(mod)])
    [dept] = mod.build_personnel_by_department(personnel)
    assert dept["totalFteCurrent"] == 2
