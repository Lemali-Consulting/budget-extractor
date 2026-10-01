"""Tests for drop-cap merging used to repair PDF small-caps text splits."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_web_data import _merge_dropcap_splits


def test_merges_cover_title_dropcaps():
    raw = "2026\nC B\nAPITAL UDGET\n& SIX YEAR PLAN"
    assert _merge_dropcap_splits(raw) == "2026\nCAPITAL BUDGET\n& SIX YEAR PLAN"


def test_merges_single_dropcap():
    raw = "F\nINANCE"
    assert _merge_dropcap_splits(raw) == "FINANCE"


def test_leaves_normal_text_alone():
    raw = "Resolution 834 of 2025\nResolution adopting and approving the 2026 Capital Budget."
    assert _merge_dropcap_splits(raw) == raw


def test_does_not_merge_when_word_counts_differ():
    # 2 letters, 3 words below — not a drop-cap pattern
    raw = "A B\nFOO BAR BAZ"
    assert _merge_dropcap_splits(raw) == raw


def test_does_not_merge_lowercase_continuation():
    # Continuation must be uppercase to be a small-caps drop-cap split
    raw = "C B\napital udget"
    assert _merge_dropcap_splits(raw) == raw


def test_handles_empty_string():
    assert _merge_dropcap_splits("") == ""
