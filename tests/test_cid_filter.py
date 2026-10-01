"""Tests for CID-garbage detection used to suppress unreadable PDF text."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_web_data import _is_cid_garbage, _is_empty_table


def test_plain_text_is_not_cid():
    assert _is_cid_garbage("The 2026 Capital Budget supports infrastructure.") is False


def test_empty_string_is_not_cid():
    assert _is_cid_garbage("") is False
    assert _is_cid_garbage("   ") is False


def test_all_cid_tokens_is_garbage():
    assert _is_cid_garbage("(cid:28)(cid:34)(cid:44)(cid:49)(cid:1)(cid:40)") is True


def test_mostly_cid_with_some_punctuation_is_garbage():
    text = "(cid:53)(cid:17) (cid:39)(cid:68) (cid:11)(cid:1)(cid:51)"
    assert _is_cid_garbage(text) is True


def test_one_cid_in_long_sentence_is_not_garbage():
    text = "The mayor's office (cid:160) presented the 2026 capital plan to council."
    assert _is_cid_garbage(text) is False


def test_table_with_all_cid_headers_and_rows_is_empty():
    table = {
        "headers": ["(cid:53)(cid:17)(cid:39)", "(cid:31)(cid:61)(cid:71)"],
        "rows": [["(cid:28)(cid:62)(cid:55)", "(cid:46)(cid:75)(cid:68)"]],
    }
    assert _is_empty_table(table) is True


def test_normal_table_is_not_empty():
    table = {
        "headers": ["Project Name", "2026 Total"],
        "rows": [["28th Street Bridge", "75,000"]],
    }
    assert _is_empty_table(table) is False
