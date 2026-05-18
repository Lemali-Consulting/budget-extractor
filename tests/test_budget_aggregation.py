"""Tests for fund classification and operating-budget aggregation in build_web_data.py."""
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


def test_classify_fund_trust():
    """Trust fund sections are classified as 'trust'."""
    mod = _mod()
    assert mod.classify_fund({"title": "Liquid Fuels Trust Fund"}) == "trust"
    assert mod.classify_fund({"title": "Frick Park Trust Fund"}) == "trust"


def test_classify_fund_operating():
    """Regular departments and bureaus are 'operating'."""
    mod = _mod()
    assert mod.classify_fund({"title": "Department of Finance"}) == "operating"
    assert mod.classify_fund({"title": "Bureau of Police"}) == "operating"
    assert mod.classify_fund({"title": "Citizen Police Review Board"}) == "operating"


def test_classify_fund_other():
    """Non-department appendix/reference sections are 'other'."""
    mod = _mod()
    assert mod.classify_fund({"title": "Appendices"}) == "other"
    assert mod.classify_fund({"title": "Grants"}) == "other"
    assert mod.classify_fund({"title": "Other Special Revenue Funds"}) == "other"


def test_operating_budget_changes_excludes_non_operating():
    """Trust funds must not appear in operating department changes."""
    mod = _mod()
    cur, pri = f"{mod.BUDGET_YEAR} Budget", f"{mod.PRIOR_YEAR} Budget"
    rows = [
        {"department": "Bureau of Police", "slug": "bureau-of-police",
         "year": pri, "amount": 100, "fund": "operating"},
        {"department": "Bureau of Police", "slug": "bureau-of-police",
         "year": cur, "amount": 110, "fund": "operating"},
        {"department": "Liquid Fuels Trust Fund", "slug": "liquid-fuels-trust-fund",
         "year": pri, "amount": 50, "fund": "trust"},
        {"department": "Liquid Fuels Trust Fund", "slug": "liquid-fuels-trust-fund",
         "year": cur, "amount": 60, "fund": "trust"},
    ]
    changes = mod._operating_budget_changes(rows)
    assert len(changes) == 1
    assert changes[0]["slug"] == "bureau-of-police"
    assert changes[0]["dollarChange"] == 10
    assert changes[0]["pctChange"] == 10.0
    assert changes[0][f"budget{mod.BUDGET_YEAR}"] == 110


def test_operating_budget_changes_keeps_unlabeled_total_departments():
    """Departments whose PDF total row is unlabeled (e.g. Finance) must still appear:
    department_budgets has already resolved their totals, so the pivot includes them."""
    mod = _mod()
    cur, pri = f"{mod.BUDGET_YEAR} Budget", f"{mod.PRIOR_YEAR} Budget"
    rows = [
        {"department": "Department of Finance", "slug": "department-of-finance",
         "year": pri, "amount": 193056054, "fund": "operating"},
        {"department": "Department of Finance", "slug": "department-of-finance",
         "year": cur, "amount": 197799537, "fund": "operating"},
    ]
    changes = mod._operating_budget_changes(rows)
    assert len(changes) == 1
    assert changes[0]["slug"] == "department-of-finance"
