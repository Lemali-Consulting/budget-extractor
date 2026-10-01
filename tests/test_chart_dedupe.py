"""Tests for chart region deduplication used to suppress nested/duplicate figures."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_web_data import _dedupe_chart_regions


def _r(bbox: list[float], chart_type: str = "raster_image") -> dict:
    return {"bbox": bbox, "chart_type": chart_type}


def test_keeps_unique_non_overlapping_regions():
    regions = [
        _r([0, 0, 100, 100]),
        _r([200, 0, 300, 100]),
    ]
    result = _dedupe_chart_regions(regions, page_width=612, page_height=792)
    assert len(result) == 2


def test_drops_smaller_region_contained_in_larger():
    big = _r([0, 0, 500, 500])
    small = _r([100, 100, 200, 200])
    result = _dedupe_chart_regions([big, small], page_width=612, page_height=792)
    assert result == [big]


def test_drops_full_page_raster_artifact():
    full = _r([0, 0, 612, 792], chart_type="vector_chart")
    real = _r([100, 100, 300, 300])
    result = _dedupe_chart_regions([full, real], page_width=612, page_height=792)
    assert real in result
    assert full not in result


def test_drops_duplicate_logo_at_same_position():
    a = _r([215, 400, 399, 580], chart_type="logo")
    b = _r([232, 410, 379, 557], chart_type="logo")
    result = _dedupe_chart_regions([a, b], page_width=612, page_height=792)
    assert len(result) == 1
    assert result[0]["bbox"] == a["bbox"]


def test_zero_area_region_is_dropped():
    regions = [_r([0, 0, 0, 0]), _r([10, 10, 100, 100])]
    result = _dedupe_chart_regions(regions, page_width=612, page_height=792)
    assert len(result) == 1
    assert result[0]["bbox"] == [10, 10, 100, 100]


def test_drops_region_mostly_off_page():
    # bbox extends far beyond the right edge — only a sliver is visible
    off = _r([602.9, -50.3, 1269.6, 212.7])
    on = _r([100, 100, 300, 300])
    result = _dedupe_chart_regions([off, on], page_width=612, page_height=792)
    assert on in result
    assert off not in result


def test_keeps_region_partially_off_page_if_mostly_visible():
    # bbox extends slightly off the left edge but most is on-page
    r = _r([-20, 100, 400, 500])
    result = _dedupe_chart_regions([r], page_width=612, page_height=792)
    assert result == [r]


def test_empty_input():
    assert _dedupe_chart_regions([], page_width=612, page_height=792) == []


def test_drops_decorative_banner_stripe():
    # Wide, short raster (gold banner across the cover) — aspect ratio ~4, height < 100pt
    banner = _r([341.3, 472.7, 643.2, 548.8])
    real = _r([100, 100, 400, 500])
    result = _dedupe_chart_regions([banner, real], page_width=612, page_height=792)
    assert real in result
    assert banner not in result


def test_keeps_normal_landscape_figure():
    # 3:2 landscape photo — should not be flagged as a banner stripe
    photo = _r([50, 50, 500, 350])  # 450 x 300, ratio 1.5
    result = _dedupe_chart_regions([photo], page_width=612, page_height=792)
    assert result == [photo]


def test_does_not_flag_wide_logo_as_banner():
    # logos can be any shape; banner heuristic only applies to raster_image
    wide_logo = _r([0, 400, 612, 460], chart_type="logo")
    result = _dedupe_chart_regions([wide_logo], page_width=612, page_height=792)
    assert result == [wide_logo]
