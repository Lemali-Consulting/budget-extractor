"""Tests for attaching the PDF's pay-split ("allocation") tables to the position lines they cover."""

import pytest

from utils.fund_splits import FundSplitError, attach_fund_splits

PS_ADMIN = "bureau-of-administration-public-safety"
RAD_PARKS = "regional-asset-district-parks-and-recreation-trust-fund"
PARKS = "department-of-parks-and-recreation"
SENIOR_CITIZENS = "senior-citizens-program-trust-fund"


def _section(slug: str, title: str, allocations: list[list[str]] | None = None) -> dict:
    """A section whose only table, if any, is a split table laid out as the 2027 PDF prints it."""
    tables = []
    if allocations:
        tables.append({"table_type": "allocation", "headers": allocations[0], "rows": allocations[1:]})
    return {"slug": slug, "title": title, "tables": tables}


def _line(slug: str, title: str, fte: float | None) -> dict:
    """One position line as the personnel build emits it."""
    return {"slug": slug, "department": slug, "title": title, "fteCurrent": fte}


SECTIONS = [
    _section(PS_ADMIN, "Bureau of Administration (Public Safety)", [
        ["2027 Allocations", "Public Safety Administration General Fund", "Parks RAD Trust Fund"],
        ["Senior Park Ranger", "12%", "88%"],
    ]),
    _section(RAD_PARKS, "Regional Asset District - Parks and Recreation Trust Fund"),
    _section(PARKS, "Department of Parks and Recreation"),
    _section(SENIOR_CITIZENS, "Senior Citizens Program Trust Fund", [
        ["2027 Allocations", "Department of Parks & Recreation", "Senior Citizens Program Trust Fund"],
        ["Assistant Director", "50%", "50%"],
    ]),
]


def _lines() -> list[dict]:
    return [
        _line(PS_ADMIN, "Senior Park Ranger*", 0.12),
        _line(RAD_PARKS, "Senior Park Ranger", 1.88),
        _line(PARKS, "Assistant Director", None),
        _line(PARKS, "Assistant Director of Administration & Senior Programs*", 0.5),
        _line(SENIOR_CITIZENS, "Assistant Director of Administration & Senior Programs*", 0.5),
        _line(PARKS, "Director", 1.0),
    ]


def _split_of(lines: list[dict], slug: str, title: str) -> list[tuple[str, int]] | None:
    line = next(l for l in lines if l["slug"] == slug and l["title"] == title)
    split = line.get("fundSplit")
    return None if split is None else [(s["fund"], s["percent"]) for s in split]


def test_a_starred_line_gets_the_split_printed_in_its_own_section() -> None:
    lines = attach_fund_splits(_lines(), sections=SECTIONS)
    assert _split_of(lines, PS_ADMIN, "Senior Park Ranger*") == [
        ("Public Safety Administration General Fund", 12), ("Parks RAD Trust Fund", 88),
    ]


def test_the_other_funds_line_gets_the_split_even_without_an_asterisk() -> None:
    """The PDF prints each split once but stars only some of the lines it covers (RAD's Senior Park Ranger has no star)."""
    lines = attach_fund_splits(_lines(), sections=SECTIONS)
    assert _split_of(lines, RAD_PARKS, "Senior Park Ranger") == [
        ("Public Safety Administration General Fund", 12), ("Parks RAD Trust Fund", 88),
    ]


def test_a_shortened_split_title_matches_the_starred_funded_line_not_an_unfunded_namesake() -> None:
    """The split table says "Assistant Director"; the funded line is the longer starred title, and Parks also lists an unfunded "Assistant Director"."""
    lines = attach_fund_splits(_lines(), sections=SECTIONS)
    expected = [("Department of Parks & Recreation", 50), ("Senior Citizens Program Trust Fund", 50)]
    assert _split_of(lines, PARKS, "Assistant Director of Administration & Senior Programs*") == expected
    assert _split_of(lines, SENIOR_CITIZENS, "Assistant Director of Administration & Senior Programs*") == expected
    assert _split_of(lines, PARKS, "Assistant Director") is None


def test_each_fund_links_to_its_section() -> None:
    lines = attach_fund_splits(_lines(), sections=SECTIONS)
    line = next(l for l in lines if l["slug"] == RAD_PARKS)
    assert [s["slug"] for s in line["fundSplit"]] == [PS_ADMIN, RAD_PARKS]


def test_lines_no_split_table_covers_get_none() -> None:
    lines = attach_fund_splits(_lines(), sections=SECTIONS)
    assert _split_of(lines, PARKS, "Director") is None


def test_a_dash_percentage_is_a_fund_the_title_is_not_split_into() -> None:
    """Split tables with three or more fund columns print "—%" for funds that pay nothing toward a title."""
    sections = [
        _section(RAD_PARKS, "Regional Asset District - Parks and Recreation Trust Fund", [
            ["2027 Allocations", "Parks and Recreation General Fund", "Public Safety Administration General Fund", "Parks RAD Trust Fund"],
            ["Senior Park Ranger", "—%", "12%", "88%"],
        ]),
        _section(PS_ADMIN, "Bureau of Administration (Public Safety)"),
        _section(PARKS, "Department of Parks and Recreation"),
    ]
    lines = attach_fund_splits(
        [_line(PS_ADMIN, "Senior Park Ranger*", 0.12), _line(RAD_PARKS, "Senior Park Ranger", 1.88)],
        sections=sections,
    )
    assert _split_of(lines, RAD_PARKS, "Senior Park Ranger") == [
        ("Public Safety Administration General Fund", 12), ("Parks RAD Trust Fund", 88),
    ]


def test_an_unrecognised_fund_name_fails_the_build() -> None:
    """A fund the build can't place would silently drop part of a split, so it must stop the build instead."""
    sections = [_section(PS_ADMIN, "Bureau of Administration (Public Safety)", [
        ["2027 Allocations", "Public Safety Administration General Fund", "Mystery Trust Fund"],
        ["Senior Park Ranger", "12%", "88%"],
    ])]
    with pytest.raises(FundSplitError, match="Mystery Trust Fund"):
        attach_fund_splits([_line(PS_ADMIN, "Senior Park Ranger*", 0.12)], sections=sections)


def test_a_split_with_no_matching_line_fails_the_build() -> None:
    """A split title that matches no funded line means the matching rules no longer fit the PDF."""
    with pytest.raises(FundSplitError, match="Senior Park Ranger"):
        attach_fund_splits([_line(PS_ADMIN, "Senior Park Ranger*", 0.12)], sections=SECTIONS)
