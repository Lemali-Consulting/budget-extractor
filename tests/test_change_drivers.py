"""The line a department's "key changes" box says led its budget change must read as plain English."""
from utils.change_drivers import driver_name


def test_a_line_item_whose_name_needs_its_category_gets_it():
    """"Regular" alone doesn't say what it is: it is regular salaries and wages.

    Public Source's fact-check found Police's box reading "led by $9.4M more in
    regular" (Rich's factcheck sheet "1126", row 20, column D).
    """
    assert driver_name(label="51101 - Regular", changes=[]) == "regular salaries and wages"


def test_a_category_made_of_one_changing_line_item_is_named_for_that_line():
    """Law's whole miscellaneous change is judgments, so the box says judgments.

    Fact-check sheet "1126", row 38, column D: "miscellaneous" should read
    "judgments".
    """
    changes = [("58 - MISCELLANEOUS", -2_300_550.0), ("58105 - Judgments", -2_300_550.0)]
    assert driver_name(label="58 - MISCELLANEOUS", changes=changes) == "judgments"


def test_a_category_whose_change_is_spread_across_lines_keeps_its_own_name():
    changes = [
        ("51 - PERSONNEL-SALARIES & WAGES", 4_262_707.0),
        ("51101 - Regular", 9_445_445.0),
        ("51401 - Premium Pay", -5_485_722.0),
    ]
    assert driver_name(label="51 - PERSONNEL-SALARIES & WAGES", changes=changes) == "personnel-salaries & wages"


def test_a_label_without_an_account_code_is_phrase_cased():
    assert driver_name(label="Recreational Services", changes=[]) == "recreational services"
