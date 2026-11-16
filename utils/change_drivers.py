"""Names the line that led a department's budget change, for the "key changes" box.

A department's financial summary lists spending categories ("58 - MISCELLANEOUS")
and the line items under them ("58105 - Judgments"). The box names whichever
changed most. Public Source's fact-check (Rich's factcheck sheet "1126", rows 20
and 38) found two names that didn't say enough: "regular" (regular salaries and
wages) and "miscellaneous" (all of it judgments).
"""

import re

from utils.text_case import phrase_case

ACCOUNT_CODE: re.Pattern[str] = re.compile(r"^(\d+)\s*-\s*")
CATEGORY_CODE_DIGITS: int = 2

# Line items whose printed name only makes sense under its category heading.
LINE_ITEM_NAMES: dict[str, str] = {
    "51101": "regular salaries and wages",
}


def _code(label: str) -> str | None:
    match: re.Match[str] | None = ACCOUNT_CODE.match(label)
    return match.group(1) if match else None


def _plain_name(label: str) -> str:
    code: str | None = _code(label)
    if code in LINE_ITEM_NAMES:
        return LINE_ITEM_NAMES[code]
    return phrase_case(ACCOUNT_CODE.sub("", label))


def _sole_changing_line_item(*, category_code: str, changes: list[tuple[str, float]]) -> str | None:
    """The one line item under a category that changed, or None if there are none or several."""
    items: list[str] = [
        label for label, change in changes
        if change != 0
        and (code := _code(label)) is not None
        and len(code) > CATEGORY_CODE_DIGITS
        and code.startswith(category_code)
    ]
    return items[0] if len(items) == 1 else None


def driver_name(*, label: str, changes: list[tuple[str, float]]) -> str:
    """The driver's name in plain words; a category made of one changing line item is named for that line."""
    code: str | None = _code(label)
    if code is not None and len(code) == CATEGORY_CODE_DIGITS:
        sole: str | None = _sole_changing_line_item(category_code=code, changes=changes)
        if sole is not None:
            return _plain_name(sole)
    return _plain_name(label)
