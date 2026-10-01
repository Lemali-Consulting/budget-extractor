"""Tests that a header column boundary landing inside data words snaps to the nearby narrow data gap."""
from utils.spatial_table_extractor import SpatialTableExtractor

# Geometry measured from the 2027 Bureau of Fire position summary: right-aligned
# FTE counts end at x=262.5 and the Rate/Grade values start ~6pt later. The
# header's FTE | Rate/ boundary sits at x=271.0 — inside the rate numbers.
FTE_RIGHT_EDGE: float = 262.5
HEADER_FTE_RATE_SEP: float = 271.0
TITLE_RATE_GAP_SEP: float = 214.0


def _word(text: str, x0: float, x1: float, top: float) -> dict:
    """Build a pdfplumber-style word dict."""
    return {"text": text, "x0": x0, "x1": x1, "top": top, "bottom": top + 9.0}


def _position_rows() -> list[list[dict]]:
    """Title | FTE | Rate | Hours rows with a narrow FTE→Rate gap."""
    specs: list[tuple[str, str, float, str, float, float]] = [
        ("Chief", "1", 257.5, "159,141", 268.9, 300.7),
        ("Assistant", "2", 257.5, "148,533", 268.9, 301.4),
        ("Deputy", "4", 257.5, "121,368", 268.9, 301.4),
        ("Battalion", "18", 252.5, "115,839", 268.9, 301.4),
        ("Lieutenant", "112", 247.5, "92,995", 271.8, 299.3),
    ]
    rows: list[list[dict]] = []
    for i, (title, fte, fte_x0, rate, rate_x0, rate_x1) in enumerate(specs):
        top: float = 100.0 + i * 13.0
        rows.append([
            _word(title, 57.0, 110.0, top),
            _word(fte, fte_x0, FTE_RIGHT_EDGE, top),
            _word(rate, rate_x0, rate_x1, top),
            _word("12", 326.0, 336.0, top),
        ])
    return rows


def test_header_sep_inside_data_snaps_to_corroborating_gap() -> None:
    """FTE and Rate become separate columns when the data shows a consistent narrow gap."""
    rows: list[list[dict]] = _position_rows()
    words: list[dict] = [w for r in rows for w in r]
    ext = SpatialTableExtractor()

    columns = ext._detect_columns(
        words,
        rows,
        header_separators=[TITLE_RATE_GAP_SEP, HEADER_FTE_RATE_SEP],
    )

    boundaries: list[float] = [c.x0 for c in columns[1:]]
    assert any(FTE_RIGHT_EDGE <= b <= 268.9 for b in boundaries), boundaries


def test_padded_tokens_with_clean_channel_split_at_channel() -> None:
    """Space-padded tokens leave only a ~4pt channel; the split still lands in it.

    Mirrors the merged-token geometry the extractor actually sees on the 2027
    Fire page: '1 ' ends at 265.0 and ' 159,141  ' starts at 268.9, so most
    rows have a sub-threshold gap too narrow to register on its own.
    """
    padded_fte_right: float = 265.0
    # (title, fte_x0, rate_text, rate_x0, rate_x1) — token extents as measured.
    specs: list[tuple[str, float, str, float, float]] = [
        ("Fire Chief", 257.5, "159,141", 268.9, 308.1),
        ("Assistant Chief", 257.5, "148,533", 268.9, 308.1),
        ("Deputy Chief *", 257.5, "121,368", 268.9, 308.1),
        ("Battalion Chief *", 252.5, "115,839", 268.9, 308.1),
        ("Fire Captain", 252.5, "102,299", 268.9, 308.1),
        ("Fire Lieutenant", 247.5, "92,995", 268.9, 301.8),
        ("Firefighter", 247.5, "see below", 270.8, 302.3),
        ("Deputy Fire Marshal", 257.5, "65,518", 272.9, 300.4),
    ]
    rows: list[list[dict]] = []
    for i, (title, fte_x0, rate, rate_x0, rate_x1) in enumerate(specs):
        top: float = 156.0 + i * 13.0
        rows.append([
            _word(title, 56.6, 140.0, top),
            _word("1", fte_x0, padded_fte_right, top),
            _word(rate, rate_x0, rate_x1, top),
            _word("12", 326.0, 338.5, top),
        ])
    words: list[dict] = [w for r in rows for w in r]
    ext = SpatialTableExtractor()

    columns = ext._detect_columns(
        words,
        rows,
        header_separators=[TITLE_RATE_GAP_SEP, HEADER_FTE_RATE_SEP],
    )

    boundaries: list[float] = [c.x0 for c in columns[1:]]
    assert any(padded_fte_right <= b <= 268.9 for b in boundaries), boundaries


def test_header_sep_inside_data_without_gap_is_not_added() -> None:
    """A header boundary that cuts through data with no gap nearby adds no split."""
    rows: list[list[dict]] = _position_rows()
    # Close the FTE→Rate gap: rate numbers now abut the FTE counts.
    for r in rows:
        r[2]["x0"] = FTE_RIGHT_EDGE + 1.0
    words: list[dict] = [w for r in rows for w in r]
    ext = SpatialTableExtractor()

    columns = ext._detect_columns(
        words,
        rows,
        header_separators=[TITLE_RATE_GAP_SEP, HEADER_FTE_RATE_SEP],
    )

    boundaries: list[float] = [c.x0 for c in columns[1:]]
    assert not any(240.0 < b < 300.0 for b in boundaries), boundaries
