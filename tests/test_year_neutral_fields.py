"""Tests for the year meta file and year-neutral twin fields in build_web_data.py."""
import importlib.util
import types


def _mod() -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("build_web_data", "scripts/build_web_data.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.BUDGET_YEAR = 2027
    mod.PRIOR_YEAR = 2026
    return mod


def test_budget_meta_has_year_and_variants() -> None:
    m = _mod()
    meta = m.build_budget_meta(year=2027, operating_variant="proposed", capital_variant="proposed")
    assert meta == {
        "year": 2027,
        "priorYear": 2026,
        "operatingVariant": "proposed",
        "capitalVariant": "proposed",
    }


def test_add_year_neutral_fields_keeps_named_and_adds_twins() -> None:
    m = _mod()
    rec = {"budget2027": 5.0, "budget2026": 4.0, "fte2027": 2.0, "fte2026": 1.0, "title": "x"}
    out = m.add_year_neutral_fields(rec)
    assert out["budget2027"] == 5.0 and out["fte2026"] == 1.0
    assert out["budgetCurrent"] == 5.0 and out["budgetPrior"] == 4.0
    assert out["fteCurrent"] == 2.0 and out["ftePrior"] == 1.0
    assert out["title"] == "x"


def test_add_year_neutral_fields_totals_and_missing_keys() -> None:
    m = _mod()
    out = m.add_year_neutral_fields({"totalBudget2027": 9.0, "totalFte2026": 3.0})
    assert out["totalBudgetCurrent"] == 9.0
    assert out["totalFtePrior"] == 3.0
    assert "totalBudgetPrior" not in out


def test_personnel_rows_and_by_department_carry_twins() -> None:
    m = _mod()
    personnel = [{
        "department": "D", "slug": "d", "title": "T",
        "fte2026": 1.0, "fte2027": 2.0, "budget2026": 10.0, "budget2027": 20.0,
    }]
    by_dept = m.build_personnel_by_department(personnel)
    assert by_dept[0]["totalBudgetCurrent"] == 20.0
    assert by_dept[0]["totalFtePrior"] == 1.0
    assert by_dept[0]["totalBudget2027"] == 20.0


def test_budget_changes_has_twins_everywhere() -> None:
    m = _mod()
    dept_budgets = [
        {"slug": "a", "department": "A", "fund": "operating", "year": "2026 Budget", "amount": 100.0},
        {"slug": "a", "department": "A", "fund": "operating", "year": "2027 Budget", "amount": 150.0},
        {"slug": "b", "department": "B", "fund": "operating", "year": "2026 Budget", "amount": 100.0},
        {"slug": "b", "department": "B", "fund": "operating", "year": "2027 Budget", "amount": 50.0},
    ]
    out = m.build_budget_changes([], [], dept_budgets)
    assert out["totalBudgetCurrent"] == out["totalBudget2027"] == 200.0
    assert out["totalBudgetPrior"] == out["totalBudget2026"] == 200.0
    assert out["totalFteCurrent"] == out["totalFte2027"]
    for key in ("departmentChanges", "topIncreases", "topDecreases"):
        for item in out[key]:
            assert item["budgetCurrent"] == item["budget2027"]
            assert item["budgetPrior"] == item["budget2026"]
