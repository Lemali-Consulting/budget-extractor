"""Tests for shifted position detection in build_web_data.py."""
import importlib
import sys
import types


def _import_build_web_data() -> types.ModuleType:
    """Import build_web_data as a module, handling the script-style layout."""
    spec = importlib.util.spec_from_file_location(
        "build_web_data", "scripts/build_web_data.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_personnel(
    title: str,
    department: str,
    fte_prior: float,
    fte_current: float,
    budget_prior: float = 0,
    budget_current: float = 0,
) -> dict:
    """Build a personnel dict matching build_web_data conventions."""
    mod = _import_build_web_data()
    return {
        "title": title,
        "department": department,
        f"fte{mod.PRIOR_YEAR}": fte_prior,
        f"fte{mod.BUDGET_YEAR}": fte_current,
        f"budget{mod.PRIOR_YEAR}": budget_prior,
        f"budget{mod.BUDGET_YEAR}": budget_current,
    }


def test_exact_title_match_detected_as_shift():
    """A position eliminated in dept A and created in dept B with same title is a shift."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Manager, 311 Response Line", "Office of the Mayor", 1, 0, 83000, 0),
        _make_personnel("Manager, 311 Response Line", "Dept of Innovation", 0, 1, 0, 86000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 1
    shift = result["shiftedPositions"][0]
    assert shift["title"] == "Manager, 311 Response Line"
    assert shift["fromDepartment"] == "Office of the Mayor"
    assert shift["toDepartment"] == "Dept of Innovation"
    assert shift["fte"] == 1
    # These should be removed from new/eliminated
    assert len(result["newPositions"]) == 0
    assert len(result["eliminatedPositions"]) == 0


def test_no_shift_when_title_differs():
    """Different titles should not be matched."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Clerk I", "Dept A", 1, 0, 50000, 0),
        _make_personnel("Clerk II", "Dept B", 0, 1, 0, 55000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 0
    assert len(result["newPositions"]) == 1
    assert len(result["eliminatedPositions"]) == 1


def test_no_shift_within_same_department():
    """A position eliminated and re-created in the same department is not a shift."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Analyst", "Dept A", 1, 0, 60000, 0),
        _make_personnel("Analyst", "Dept A", 0, 1, 0, 65000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 0
    assert len(result["newPositions"]) == 1
    assert len(result["eliminatedPositions"]) == 1


def test_partial_shift_different_fte():
    """When FTE counts differ, match the smaller count and leave remainder."""
    mod = _import_build_web_data()
    # 3 eliminated from Mayor, 1 new in Operations — should shift 1, leave 2 eliminated
    personnel = [
        _make_personnel("Neighborhood Coordinator", "Office of the Mayor", 3, 0, 180000, 0),
        _make_personnel("Neighborhood Coordinator", "Bureau of Operations", 0, 1, 0, 65000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 1
    shift = result["shiftedPositions"][0]
    assert shift["fte"] == 1
    # 2 FTE remain eliminated
    assert len(result["eliminatedPositions"]) == 1
    assert result["eliminatedPositions"][0]["fte"] == 2
    # Nothing left as new
    assert len(result["newPositions"]) == 0


def test_multiple_destinations():
    """One eliminated title matching multiple new departments creates multiple shifts."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Press Officer", "Office of the Mayor", 2, 0, 120000, 0),
        _make_personnel("Press Officer", "Dept A", 0, 1, 0, 62000),
        _make_personnel("Press Officer", "Dept B", 0, 1, 0, 62000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 2
    assert len(result["newPositions"]) == 0
    assert len(result["eliminatedPositions"]) == 0


def test_asterisk_normalized():
    """Trailing asterisks in titles should be normalized for matching."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Deputy Chief *", "Dept A", 1, 0, 100000, 0),
        _make_personnel("Deputy Chief", "Dept B", 0, 1, 0, 105000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 1


def test_case_insensitive_matching():
    """Title matching should be case-insensitive."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("STORES MANAGER", "Dept A", 1, 0, 77000, 0),
        _make_personnel("Stores Manager", "Dept B", 0, 1, 0, 79000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 1


def test_unchanged_positions_ignored():
    """Positions present in both years (not new/eliminated) are not shifted."""
    mod = _import_build_web_data()
    personnel = [
        _make_personnel("Clerk", "Dept A", 2, 2, 80000, 82000),
        _make_personnel("Clerk", "Dept B", 1, 0, 40000, 0),
        _make_personnel("Clerk", "Dept C", 0, 1, 0, 42000),
    ]
    result = mod.detect_shifted_positions(personnel)
    assert len(result["shiftedPositions"]) == 1
    assert result["shiftedPositions"][0]["fromDepartment"] == "Dept B"
    assert result["shiftedPositions"][0]["toDepartment"] == "Dept C"
