"""Tests that labels the build derives from the PDF's ALL CAPS account names follow Public Source's sentence-case style."""
import importlib.util
import types


def _mod() -> types.ModuleType:
    """Import build_web_data as a module, handling the script-style layout."""
    spec = importlib.util.spec_from_file_location(
        "build_web_data", "scripts/build_web_data.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _revenue_detail(mod: types.ModuleType, labels: list[str]) -> dict:
    """A Revenue Detail section whose top-level category rows carry the given ALL CAPS labels."""
    return {
        "title": mod.REVENUE_DETAIL_TITLE,
        "tables": [{
            "headers": ["Account", f"{mod.BUDGET_YEAR}"],
            "rows": [[label, "1,000"] for label in labels],
            "sections": labels,
        }],
    }


def test_revenue_categories_are_sentence_case():
    """Revenue categories read "Charges for services", not "Charges For Services".

    The PDF prints them in ALL CAPS; Public Source's style capitalizes only the
    first word and proper nouns.
    """
    mod = _mod()
    items = mod.build_revenue_waterfall([_revenue_detail(mod, ["41 - TAX REVENUE", "43 - CHARGES FOR SERVICES"])])
    assert [i["label"] for i in items] == ["Tax revenue", "Charges for services"]


def test_sentence_case_keeps_proper_nouns_and_acronyms():
    """Names such as General Fund and acronyms such as URA keep their capitals."""
    mod = _mod()
    assert mod.sentence_case("TRANSFER TO GENERAL FUND") == "Transfer to General Fund"
    assert mod.sentence_case("URA PROGRAMMING") == "URA programming"
    assert mod.sentence_case("CITY OF PITTSBURGH GRANTS") == "City of Pittsburgh grants"


def test_label_starting_with_a_number_has_no_capital():
    """"2027 Budget" becomes "2027 budget": the first word is the number, so nothing after it is capitalized."""
    mod = _mod()
    assert mod.sentence_case("2027 Budget") == "2027 budget"


def test_sentence_case_keeps_regional_asset_district():
    """"Regional Asset District" is the name of the county's asset district, so it keeps its capitals.

    The revenue summary lists "Regional Asset District Tax Relief" among the
    city's taxes; the web side's case module keeps the same name.
    """
    from utils.text_case import sentence_case
    assert sentence_case("REGIONAL ASSET DISTRICT TAX RELIEF") == "Regional Asset District tax relief"


def test_sentence_case_hyphenates_five_year():
    """"Five-year" is a compound modifier, so it takes a hyphen however the PDF prints it.

    Public Source asked for "Five-year forecast" on every department page
    (Rich's factcheck sheet, row 20 and others, 2026-11-13); the web side's
    case module applies the same rule.
    """
    from utils.text_case import sentence_case
    assert sentence_case("FIVE YEAR FORECAST") == "Five-year forecast"
    assert sentence_case("Five-Year Financial Forecast") == "Five-year financial forecast"
