"""Tests that the headline year's search data no longer points at the retired "What Changed" page."""
import json
from pathlib import Path

# The 2027 "What Changed" page was retired at the client's request: moving
# functions between departments made a department-by-department comparison
# misleading. Only the archive years keep that page.
HEADLINE_SEARCH_INDEX: Path = Path(__file__).resolve().parent.parent / "web/src/data/views/search-index.json"
RETIRED_HREF: str = "/changes/"


def test_headline_search_index_has_no_entries_for_the_retired_changes_page() -> None:
    """A headline search result never leads to the retired What Changed page."""
    items: list[dict] = json.loads(HEADLINE_SEARCH_INDEX.read_text(encoding="utf-8"))

    hrefs: list[str] = [item["href"] for item in items if item.get("href", "").startswith(RETIRED_HREF)]

    assert hrefs == []
