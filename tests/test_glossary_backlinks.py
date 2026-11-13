"""Tests for linking glossary terms to the budget sections that use them."""

from scripts.build_web_data import build_glossary_backlinks


def _capital_section(slug: str, source: str) -> dict:
    """A capital section whose one table lists a funding source the way the PDF prints it, in capitals."""
    return {
        "slug": slug,
        "title": slug,
        "page_content": [],
        "tables": [{"headers": ["Funding source"], "rows": [[source]]}],
    }


def test_funding_source_named_in_sentence_case_still_finds_capital_sections() -> None:
    """The glossary writes funding sources in sentence case ("Bond") for house style,
    but the capital PDF prints them in capitals ("BOND"); the glossary's "used in"
    links must still find those sections."""
    glossary = {"capital_funding_sources": [{"source": "Bond"}]}
    backlinks = build_glossary_backlinks(
        operating_sections=[],
        capital_sections=[_capital_section(slug="bridge", source="BOND")],
        glossary=glossary,
    )
    assert [s["slug"] for s in backlinks["Bond"]["sections"]] == ["bridge"]


def test_funding_source_does_not_match_the_ordinary_word() -> None:
    """"Other" is a funding source; the everyday word "other" in prose is not a use of it."""
    prose = {
        "slug": "intro",
        "title": "intro",
        "page_content": [{"text_blocks": [{"text": "Among other things, the city plans ahead."}]}],
        "tables": [],
    }
    backlinks = build_glossary_backlinks(
        operating_sections=[],
        capital_sections=[prose],
        glossary={"capital_funding_sources": [{"source": "Other"}]},
    )
    assert "Other" not in backlinks
