"""Compute adopted-vs-amended differences for the operating budget.

Reads the canonical (amended) and adopted operating budget bundles plus their
department-budget / personnel views, and emits two web data files:
  - views/{year}-amendment-changes.json   high-level per-department + legislative
  - views/{year}-amendment-cell-diffs.json per-cell diffs keyed by table id

The amended bundle is the live site data; the adopted bundle is a transient
baseline produced by `build_web_data.py --operating-variant adopted
--operating-only --output-prefix adopted` (gitignored).
"""

import argparse
import json
import re
import sys
from collections import defaultdict, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.paths import DEFAULT_YEAR, web_data_dir

# Hand-verified from the source authorizing legislation (page 6) and front
# matter (page 2) of the adopted vs "as amended 4-20-26" operating budget PDFs.
AMENDMENT_LABEL = "as amended 4-20-26"
LEGISLATIVE_CHANGES = [
    {
        "title": "General Fund appropriation increased",
        "detail": "The total General Fund appropriation rose from $693,235,671 "
                  "(adopted) to $721,521,858 (as amended) — about +$28.3M.",
        "category": "Appropriation",
    },
    {
        "title": "New authorizing legislation",
        "detail": "Adopted under Resolution 835 of 2025; amended by Resolution "
                  "217 of 2026.",
        "category": "Legislation",
    },
]


def parse_amount(s: str) -> float | None:
    """Parse a currency string like '$1,234,567' into a float (None if not numeric)."""
    if not s or s.strip() in ("—", "varies", ""):
        return None
    cleaned = re.sub(r"[$,()]", "", s).strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def numeric_columns(table: dict) -> set[int]:
    """Column indices whose cells are predominantly numeric."""
    rows: list[list[str]] = table.get("rows", [])
    ncols = len(table.get("headers", []))
    if rows:
        ncols = max(ncols, max((len(r) for r in rows), default=0))
    numeric: set[int] = set()
    for ci in range(ncols):
        vals = nums = 0
        for r in rows:
            if ci < len(r):
                cell = r[ci].strip()
                if cell and cell not in ("—", "varies"):
                    vals += 1
                    if parse_amount(cell) is not None:
                        nums += 1
        if vals and nums >= vals / 2:
            numeric.add(ci)
    return numeric


def target_columns(table: dict, year: int) -> list[int]:
    """Columns to diff: budget-year columns if present, else all numeric columns."""
    headers: list[str] = table.get("headers", [])
    numeric = numeric_columns(table)
    yr = str(year)
    year_cols = [ci for ci in sorted(numeric) if ci < len(headers) and yr in headers[ci]]
    return year_cols if year_cols else sorted(numeric)


def _col_key(headers: list[str], ci: int) -> str:
    """Stable per-column key: trimmed header, or the column index when blank."""
    h = headers[ci].strip() if ci < len(headers) else ""
    return h or str(ci)


def diff_table(adopted: dict, amended: dict, year: int) -> dict[str, dict[str, dict]]:
    """Diff matched rows of two tables, keyed by row label then column key.

    Rows are matched by their (trimmed, non-empty) first-column label so the
    result survives row reordering; duplicate labels are matched in order.
    """
    headers: list[str] = amended.get("headers", [])
    cols = [ci for ci in target_columns(amended, year) if ci != 0]

    a_by_label: dict[str, deque] = defaultdict(deque)
    for r in adopted.get("rows", []):
        label = r[0].strip() if r else ""
        if label:
            a_by_label[label].append(r)

    result: dict[str, dict[str, dict]] = {}
    for r in amended.get("rows", []):
        label = r[0].strip() if r else ""
        if not label or not a_by_label.get(label):
            continue
        a_r = a_by_label[label].popleft()
        cells: dict[str, dict] = {}
        for ci in cols:
            a_val = parse_amount(a_r[ci]) if ci < len(a_r) else None
            m_val = parse_amount(r[ci]) if ci < len(r) else None
            if a_val is None and m_val is None:
                continue
            a_num, m_num = a_val or 0.0, m_val or 0.0
            if a_num == m_num:
                continue
            delta = m_num - a_num
            cells[_col_key(headers, ci)] = {
                "adopted": a_val if a_val is not None else 0.0,
                "amended": m_val if m_val is not None else 0.0,
                "delta": delta,
                "pct": round(delta / a_num * 100.0, 1) if a_num else None,
            }
        if cells:
            result[label] = cells
    return result


def _tables_by_id(sections: list[dict]) -> dict[str, dict]:
    return {t["id"]: t for s in sections for t in s.get("tables", [])}


def _signature(table: dict) -> tuple:
    return (table.get("table_type"), tuple(h.strip() for h in table.get("headers", [])))


def build_cell_diffs(adopted_sections: list[dict], amended_sections: list[dict],
                     year: int) -> tuple[dict, int]:
    """Build per-table cell diffs; match tables by id, falling back to signature."""
    a_by_id = _tables_by_id(adopted_sections)
    a_by_section: dict[int, list[dict]] = defaultdict(list)
    for s in adopted_sections:
        for t in s.get("tables", []):
            a_by_section[s.get("section_number")].append(t)

    used: set[int] = set()
    by_table: dict[str, dict] = {}
    changed_cells = 0
    for s in amended_sections:
        for t in s.get("tables", []):
            a_t = a_by_id.get(t["id"])
            if a_t is None:
                sig = _signature(t)
                for cand in a_by_section.get(s.get("section_number"), []):
                    if id(cand) not in used and _signature(cand) == sig:
                        a_t, _ = cand, used.add(id(cand))
                        break
            if a_t is None:
                continue
            d = diff_table(a_t, t, year)
            if d:
                by_table[t["id"]] = {"rows": d}
                changed_cells += sum(len(c) for c in d.values())
    return by_table, changed_cells


def build_department_changes(adopted_dept: list[dict], amended_dept: list[dict],
                             year: int) -> dict:
    """High-level per-department adopted-vs-amended budget comparison."""
    yr = f"{year} Budget"

    def index(rows: list[dict]) -> dict[str, dict]:
        return {r["slug"]: r for r in rows
                if r.get("year") == yr and r.get("fund", "operating") == "operating"}

    a, m = index(adopted_dept), index(amended_dept)
    changes: list[dict] = []
    for slug in sorted(set(a) | set(m)):
        ar, mr = a.get(slug), m.get(slug)
        a_amt = ar["amount"] if ar else 0.0
        m_amt = mr["amount"] if mr else 0.0
        delta = m_amt - a_amt
        changes.append({
            "department": (mr or ar)["department"],
            "slug": slug,
            "budgetAdopted": a_amt,
            "budgetAmended": m_amt,
            "dollarChange": delta,
            "pctChange": round(delta / a_amt * 100.0, 1) if a_amt else None,
        })

    def slim(c: dict) -> dict:
        return {k: c[k] for k in ("department", "slug", "dollarChange", "pctChange")}

    incs = sorted((c for c in changes if c["dollarChange"] > 0),
                  key=lambda c: -c["dollarChange"])
    decs = sorted((c for c in changes if c["dollarChange"] < 0),
                  key=lambda c: c["dollarChange"])
    return {
        "totalBudgetAdopted": sum(c["budgetAdopted"] for c in changes),
        "totalBudgetAmended": sum(c["budgetAmended"] for c in changes),
        "departmentChanges": sorted(changes, key=lambda c: c["department"]),
        "topIncreases": [slim(c) for c in incs[:15]],
        "topDecreases": [slim(c) for c in decs[:15]],
    }


def _total_fte(personnel: list[dict], year: int) -> float:
    key = f"fte{year}"
    return round(sum(r.get(key) or 0 for r in personnel), 2)


def _load(path: Path) -> object:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build adopted-vs-amended operating budget diffs.")
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, help=f"Budget year (default: {DEFAULT_YEAR})")
    args = parser.parse_args()
    year = args.year

    data_dir = web_data_dir()
    views = data_dir / "views"

    amended = _load(data_dir / "budget-data.json")
    adopted = _load(data_dir / "adopted-budget-data.json")
    amended_dept = _load(views / "department-budgets.json")
    adopted_dept = _load(views / "adopted-department-budgets.json")
    amended_pers = _load(views / "personnel.json")
    adopted_pers = _load(views / "adopted-personnel.json")

    changes = build_department_changes(adopted_dept, amended_dept, year)
    changes["totalFteAdopted"] = _total_fte(adopted_pers, year)
    changes["totalFteAmended"] = _total_fte(amended_pers, year)
    changes["legislativeChanges"] = LEGISLATIVE_CHANGES
    changes["amendmentLabel"] = AMENDMENT_LABEL

    by_table, changed_cells = build_cell_diffs(
        adopted["sections"], amended["sections"], year)

    cell_diffs = {
        "meta": {
            "amendmentLabel": AMENDMENT_LABEL,
            "adoptedTotal": changes["totalBudgetAdopted"],
            "amendedTotal": changes["totalBudgetAmended"],
            "changedTableCount": len(by_table),
            "changedLineItemCount": sum(len(t["rows"]) for t in by_table.values()),
            "changedCellCount": changed_cells,
        },
        "byTable": by_table,
    }

    changes_path = views / f"{year}-amendment-changes.json"
    diffs_path = views / f"{year}-amendment-cell-diffs.json"
    with open(changes_path, "w", encoding="utf-8") as f:
        json.dump(changes, f, indent=2)
    with open(diffs_path, "w", encoding="utf-8") as f:
        json.dump(cell_diffs, f, indent=2)

    print(f"Wrote {changes_path.name}: "
          f"{len(changes['departmentChanges'])} departments, "
          f"adopted ${changes['totalBudgetAdopted']:,.0f} -> "
          f"amended ${changes['totalBudgetAmended']:,.0f}")
    print(f"Wrote {diffs_path.name}: {len(by_table)} tables, "
          f"{cell_diffs['meta']['changedLineItemCount']} changed line items, "
          f"{changed_cells} changed cells")


if __name__ == "__main__":
    main()
