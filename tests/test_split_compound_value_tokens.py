"""Tests for splitting word tokens that pack several numeric column values together."""
from utils.spatial_table_extractor import SpatialTableExtractor

CHAR_WIDTH: float = 5.5


def _token(text: str, x0: float, top: float = 500.0) -> dict:
    """Build a pdfplumber word with per-character boxes laid out left to right."""
    chars: list[dict] = []
    x: float = x0
    for ch in text:
        chars.append({"text": ch, "x0": x, "x1": x + CHAR_WIDTH, "top": top, "bottom": top + 9.0})
        x += CHAR_WIDTH
    return {"text": text, "x0": x0, "x1": x, "top": top, "bottom": top + 9.0, "chars": chars}


def test_total_row_dollar_amounts_split_into_one_token_per_amount() -> None:
    """A bold total row bridged into one token splits at each '$'."""
    word: dict = _token("$ 105,595,349 $ 108,140,401 $ 111,745,836 $", x0=300.0)

    parts: list[dict] = SpatialTableExtractor._split_compound_value_tokens([word])

    assert [p["text"] for p in parts] == ["$ 105,595,349", "$ 108,140,401", "$ 111,745,836", "$"]
    assert all(a["x1"] <= b["x0"] for a, b in zip(parts, parts[1:]))
    assert parts[0]["x0"] == 300.0
    assert all("chars" not in p for p in parts)


def test_amount_and_percent_split_apart() -> None:
    """An amount bridged to a percentage by placeholder spaces becomes two tokens."""
    word: dict = _token("54,790,510   1.2 %", x0=468.0)

    parts: list[dict] = SpatialTableExtractor._split_compound_value_tokens([word])

    assert [p["text"] for p in parts] == ["54,790,510", "1.2 %"]


def test_label_text_is_left_alone() -> None:
    """Tokens containing any non-value text are not split."""
    words: list[dict] = [
        _token("Expenditures Total", x0=206.0),
        _token("Grade 12 Step 3", x0=100.0),
    ]

    parts: list[dict] = SpatialTableExtractor._split_compound_value_tokens(words)

    assert [p["text"] for p in parts] == ["Expenditures Total", "Grade 12 Step 3"]


def test_single_value_with_dollar_is_unchanged() -> None:
    """A lone '$ amount' token is one value and stays whole (chars removed)."""
    word: dict = _token("$ 58,788,492", x0=342.0)

    parts: list[dict] = SpatialTableExtractor._split_compound_value_tokens([word])

    assert [p["text"] for p in parts] == ["$ 58,788,492"]
    assert parts[0]["x0"] == 342.0 and "chars" not in parts[0]
