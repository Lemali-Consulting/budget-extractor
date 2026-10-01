"""Tests for the capital-budget appendices parser (Appendix A, B, C)."""
from __future__ import annotations

from pathlib import Path

import pytest

from utils.capital_appendices import (
    parse_appendix_a,
    parse_appendix_b,
    parse_appendix_c,
)


PDF_PATH = Path(__file__).parent.parent / "input/2026/split-pdf/capital/64_Capital_Budget_Appendices.pdf"


# ----- Appendix A: Projects by Department -----

def test_appendix_a_has_department_groups() -> None:
    appendix = parse_appendix_a(PDF_PATH)
    names = [d["name"] for d in appendix["departments"]]
    assert "DEPARTMENT OF MOBILITY AND INFRASTRUCTURE" in names
    assert "CITY COUNCIL" in names
    assert "COMMISSION ON HUMAN RELATIONS" in names


def test_appendix_a_bridge_preservation_row() -> None:
    appendix = parse_appendix_a(PDF_PATH)
    domi = next(
        d for d in appendix["departments"]
        if d["name"] == "DEPARTMENT OF MOBILITY AND INFRASTRUCTURE"
    )
    row = next(
        p for p in domi["projects"]
        if "BRIDGE PRESERVATION AND RESTORATION FUND" in p["name"]
    )
    assert row["bond"] == 420313
    assert row["other"] == 6016438
    assert row["total"] == 6436751
    assert row["cdbg"] == 0
    assert row["paygo"] == 0


def test_appendix_a_grand_totals_row() -> None:
    appendix = parse_appendix_a(PDF_PATH)
    assert appendix["totals"]["cdbg"] == 12500000
    assert appendix["totals"]["bond"] == 51002000
    assert appendix["totals"]["paygo"] == 21000000
    assert appendix["totals"]["other"] == 27757091
    assert appendix["totals"]["total"] == 112259091
    # And the Totals row must not appear as a stray project under any department.
    for dept in appendix["departments"]:
        assert all(p["name"] != "Totals" for p in dept["projects"]), \
            f"Stray Totals row found under department {dept['name']}"


def test_appendix_a_fair_housing_row() -> None:
    appendix = parse_appendix_a(PDF_PATH)
    chr_ = next(
        d for d in appendix["departments"]
        if d["name"] == "COMMISSION ON HUMAN RELATIONS"
    )
    assert len(chr_["projects"]) == 1
    fh = chr_["projects"][0]
    assert fh["name"] == "FAIR HOUSING"
    assert fh["cdbg"] == 30000
    assert fh["total"] == 30000


# ----- Appendix B: CPFC Scoring -----

def test_appendix_b_row_count_in_range() -> None:
    appendix = parse_appendix_b(PDF_PATH)
    # Spot count from the source PDF: B spans 4 dense pages at ~70 rows each.
    assert 150 <= len(appendix["scoring"]) <= 350


def test_appendix_b_top_row_senior_program() -> None:
    appendix = parse_appendix_b(PDF_PATH)
    row = appendix["scoring"][0]
    assert "SENIOR COMMUNITY PROGRAM" in row["project"]
    assert row["deliverable"] == "Senior Community Program"
    assert row["city"] == 0
    assert row["cdbg"] == 1300000
    assert row["adjusted"] == 1300000
    assert row["omb1"] == "Y"
    assert row["omb2"] == "Y"
    assert row["co1"] == "Y"
    assert row["count"] == 6
    assert row["adjusted_count"] == 5.0


def test_appendix_b_handles_deliverable_continuation() -> None:
    appendix = parse_appendix_b(PDF_PATH)
    # The NEC row's deliverable wraps over 3 source lines.
    nec = next(
        r for r in appendix["scoring"]
        if "NEIGHBORHOOD EMPLOYMENT CENTERS" in r["project"] and r["adjusted_count"] == 4.0
    )
    assert "NEC" in nec["deliverable"]
    assert "Brashear" in nec["deliverable"]
    assert "Christ Central Church" in nec["deliverable"]


def test_appendix_b_handles_project_name_continuation() -> None:
    appendix = parse_appendix_b(PDF_PATH)
    # 5010 - FACILITY IMPROVEMENTS - RECREATION AND SENIOR CENTERS wraps onto a 2nd line.
    row = next(
        r for r in appendix["scoring"]
        if "5010" in r["project"] and "Warrington" in r["deliverable"]
    )
    assert "RECREATION AND SENIOR" in row["project"]
    assert "CENTERS" in row["project"]
    assert row["city"] == 8254032


# ----- Appendix C: Glossary -----

def test_appendix_c_has_cpfc_entry() -> None:
    appendix = parse_appendix_c(PDF_PATH)
    terms = {e["acronym"]: e for e in appendix["entries"]}
    assert "CPFC" in terms
    entry = terms["CPFC"]
    assert "Capital Program Facilitation" in entry["name"]
    assert "internal group" in entry["description"]


def test_appendix_c_311_multiline_description() -> None:
    appendix = parse_appendix_c(PDF_PATH)
    entry = next(e for e in appendix["entries"] if e["acronym"] == "311")
    assert "phone number" in entry["description"]
    assert "non-emergency" in entry["description"] or "non- emergency" in entry["description"]
    assert "Department of Innovation and Performance" in entry["description"]


def test_appendix_c_cdbg_team_entry() -> None:
    appendix = parse_appendix_c(PDF_PATH)
    entry = next(e for e in appendix["entries"] if e["acronym"] == "CDBG (team)")
    assert "Community Development Division" in entry["name"]
    assert "Office of Management and Budget" in entry["description"]


def test_appendix_c_no_stray_page_numbers() -> None:
    appendix = parse_appendix_c(PDF_PATH)
    for entry in appendix["entries"]:
        for field in ("acronym", "name", "description"):
            assert not any(tok in entry[field].split() for tok in ("173", "174", "175", "176")), \
                f"Found stray page number in {field}: {entry}"


def test_appendix_c_wrapped_acronym_merged() -> None:
    appendix = parse_appendix_c(PDF_PATH)
    # 'Unexpended/Unencumbered Prior Year Funds' wraps onto two acronym lines.
    entry = next(e for e in appendix["entries"] if "Unexpended" in e["acronym"])
    assert "Prior Year Funds" in entry["acronym"]
    assert "remaining" in entry["description"]
    assert "September 2024" in entry["description"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
