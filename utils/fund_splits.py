"""Attach the budget PDF's pay-split ("allocation") tables to the position lines they cover.

When one title is paid from several funds, the PDF prints a small table in one of those funds' sections,
e.g. "Senior Park Ranger — Public Safety Administration General Fund 12%, Parks RAD Trust Fund 88%". Each
fund's position table lists only its own share, and only some of those lines carry the "*" that points to
the split. This module finds every covered line, in every fund the split names, and records the split on it.
"""

import re

ALLOCATION_TABLE_TYPE: str = "allocation"
KEY_FUND_SPLIT: str = "fundSplit"

# Fund names in the split tables that aren't their section's title. The rest match a section title once
# "&" is read as "and".
FUND_SECTION_ALIASES: dict[str, str] = {
    "Public Safety Administration General Fund": "bureau-of-administration-public-safety",
    "Parks and Recreation General Fund": "department-of-parks-and-recreation",
    "Parks RAD Trust Fund": "regional-asset-district-parks-and-recreation-trust-fund",
}

SPLIT_MARK: str = "*"
PERCENT_PATTERN: re.Pattern[str] = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*%\s*$")
# A shortened split title is followed in the full title by a comma ("Program Coordinator 3, Special
# Events") or a space ("Assistant Director of Administration & Senior Programs").
SHORTENED_TITLE_SEPARATORS: tuple[str, ...] = (",", " ")


class FundSplitError(ValueError):
    """A split table can't be placed: an unknown fund, or a title no funded line matches."""


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace(SPLIT_MARK, "").replace("&", "and")).strip().lower()


def _fund_slugs(sections: list[dict]) -> dict[str, str]:
    """Map each normalised fund or section name to its section slug."""
    slugs = {_normalise(s["title"]): s["slug"] for s in sections}
    slugs.update({_normalise(name): slug for name, slug in FUND_SECTION_ALIASES.items()})
    return slugs


def _percent(cell: str) -> int | float | None:
    """A split share such as "12%", or None for the "—%" a fund that pays nothing gets."""
    match = PERCENT_PATTERN.match(cell or "")
    if not match:
        return None
    value = float(match.group(1))
    return int(value) if value.is_integer() else value


def _covered_line(lines: list[dict], *, slug: str, split_title: str) -> dict:
    """The one funded line in a section that a split title names: an exact title, else a starred longer one."""
    wanted = _normalise(split_title)
    funded = [l for l in lines if l["slug"] == slug and l.get("fteCurrent")]
    exact = [l for l in funded if _normalise(l["title"]) == wanted]
    candidates = exact or [
        l for l in funded
        if SPLIT_MARK in l["title"]
        and any(_normalise(l["title"]).startswith(wanted + sep) for sep in SHORTENED_TITLE_SEPARATORS)
    ]
    if len(candidates) != 1:
        raise FundSplitError(
            f"Split title {split_title!r} matches {len(candidates)} funded lines in section {slug!r}; expected 1"
        )
    return candidates[0]


def _split_tables(sections: list[dict]) -> list[dict]:
    return [t for s in sections for t in s["tables"] if t["table_type"] == ALLOCATION_TABLE_TYPE]


def attach_fund_splits(lines: list[dict], *, sections: list[dict]) -> list[dict]:
    """Record on each covered position line how the PDF splits its title's pay between funds.

    A covered line gets a list of {fund, slug, percent} in the split table's column order, the fund
    named as the PDF names it; every other line gets None. Raises FundSplitError when a split names a
    fund no section matches, matches no funded line, or two tables split the same line differently.
    """
    fund_slugs = _fund_slugs(sections)
    for line in lines:
        line[KEY_FUND_SPLIT] = None

    for table in _split_tables(sections):
        funds = table["headers"][1:]
        for row in table["rows"]:
            split_title, cells = row[0], row[1:]
            split = []
            for fund, cell in zip(funds, cells):
                percent = _percent(cell)
                if percent is None:
                    continue
                slug = fund_slugs.get(_normalise(fund))
                if slug is None:
                    raise FundSplitError(f"Split table fund {fund!r} matches no section; add it to FUND_SECTION_ALIASES")
                split.append({"fund": fund, "slug": slug, "percent": percent})

            for share in split:
                line = _covered_line(lines, slug=share["slug"], split_title=split_title)
                if line[KEY_FUND_SPLIT] is not None and line[KEY_FUND_SPLIT] != split:
                    raise FundSplitError(f"{line['title']!r} in {share['slug']!r} is split differently by two tables")
                line[KEY_FUND_SPLIT] = split

    return lines
