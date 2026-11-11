"""Sentence-case conversion for labels taken from the budget PDFs, following Public Source's house style (capitalize the first word and proper nouns only)."""
import re

# Names that keep their capitals wherever they appear in a label.
PROPER_PHRASES: tuple[str, ...] = (
    "City of Pittsburgh",
    "Pittsburgh",
    "General Fund",
    "Five-Year Forecast",
    "Five-Year",
    "City Council",
)

# Acronyms the PDFs print in labels. An ALL CAPS label gives no other way to
# tell an acronym from an ordinary word, so they are listed here.
ACRONYMS: frozenset[str] = frozenset({
    "CDBG", "CIP", "CPFC", "EMS", "FTE", "HSIP", "HUD", "PILOT", "PWSA", "RAD", "TIF", "TIP", "URA", "URD",
})

WORD_PATTERN: re.Pattern[str] = re.compile(r"[A-Za-z][A-Za-z'’]*")


def _restore_word(match: re.Match[str], *, source_is_all_caps: bool) -> str:
    """Lowercase one word unless it is an acronym (known, or all caps in mixed-case text)."""
    word: str = match.group(0)
    if word.upper() in ACRONYMS:
        return word.upper()
    if not source_is_all_caps and len(word) > 1 and word.isupper():
        return word
    return word.lower()


def phrase_case(text: str) -> str:
    """Return ``text`` lowercased except for proper nouns and acronyms, for use mid-sentence."""
    source_is_all_caps: bool = text.upper() == text
    lowered: str = WORD_PATTERN.sub(lambda m: _restore_word(m, source_is_all_caps=source_is_all_caps), text)
    for phrase in PROPER_PHRASES:
        lowered = re.sub(re.escape(phrase), phrase, lowered, flags=re.IGNORECASE)
    return lowered


def sentence_case(text: str) -> str:
    """Return ``text`` with only its first letter, proper nouns and acronyms capitalized."""
    lowered: str = phrase_case(text)
    # Only a label that opens with a word gets a capital; "2027 budget" opens with the number.
    first: re.Match[str] | None = re.search(r"\S", lowered)
    if first is None or not first.group(0).isalpha():
        return lowered
    i: int = first.start()
    return lowered[:i] + lowered[i].upper() + lowered[i + 1:]
