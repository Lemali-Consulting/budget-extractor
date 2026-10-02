"""Load and apply documented corrections to labelling errors in a source budget PDF.

A corrections file (input/{year}/corrections-{subtype}.json) is data: each entry names a section, the
header row that identifies the affected tables, and how to rename their headers. Corrections are ours,
never the PDF's, so every corrected table is tagged for the website to disclose that.
"""

import json
from dataclasses import dataclass
from pathlib import Path

KEY_CORRECTIONS: str = "corrections"
KEY_ID: str = "id"
KEY_SECTION: str = "section"
KEY_WHEN_HEADERS: str = "whenHeaders"
KEY_HEADER_RENAMES: str = "headerRenames"
KEY_SUMMARY: str = "summary"
KEY_EVIDENCE: str = "evidence"
KEY_PDF_PAGE: str = "pdfPage"


class CorrectionError(ValueError):
    """A correction cannot be applied (it matches nothing, so it is probably stale)."""


@dataclass(frozen=True)
class Correction:
    """One documented header correction for the tables of one section."""

    id: str
    section: str
    when_headers: tuple[str, ...]
    header_renames: dict[str, str]
    summary: str
    evidence: str
    pdf_page: int


def load_corrections(path: Path) -> list[Correction]:
    """Read a corrections file; a missing file means no corrections."""
    if not path.exists():
        return []
    raw: dict = json.loads(path.read_text(encoding="utf-8"))
    return [
        Correction(
            id=entry[KEY_ID],
            section=entry[KEY_SECTION],
            when_headers=tuple(entry[KEY_WHEN_HEADERS]),
            header_renames=dict(entry[KEY_HEADER_RENAMES]),
            summary=entry[KEY_SUMMARY],
            evidence=entry[KEY_EVIDENCE],
            pdf_page=entry[KEY_PDF_PAGE],
        )
        for entry in raw[KEY_CORRECTIONS]
    ]


def _matches(*, correction: Correction, section: dict, table: dict) -> bool:
    """True when the table is in the correction's section and its headers include every `whenHeaders`."""
    return section["title"] == correction.section and set(correction.when_headers) <= set(table["headers"])


def _rename_simultaneously(*, headers: list[str], renames: dict[str, str]) -> list[str]:
    """Rename every header by looking up its original text, so a chain of renames cannot cascade."""
    return [renames.get(header, header) for header in headers]


def _append_ref(*, target: dict, ref: dict[str, str]) -> None:
    refs: list[dict[str, str]] = target.setdefault(KEY_CORRECTIONS, [])
    if ref not in refs:
        refs.append(ref)


def apply_corrections(*, sections: list[dict], corrections: list[Correction]) -> list[dict]:
    """Rename headers in matching tables (in place) and return one report entry per corrected table.

    Each corrected table, and its section, gains a `corrections` list of {id, summary}. Raises
    CorrectionError when a correction matches no table, so a stale correction cannot silently do nothing.
    """
    report: list[dict] = []
    for correction in corrections:
        matched: int = 0
        for section in sections:
            for table in section["tables"]:
                if not _matches(correction=correction, section=section, table=table):
                    continue
                matched += 1
                original: list[str] = list(table["headers"])
                table["headers"] = _rename_simultaneously(headers=original, renames=correction.header_renames)
                ref: dict[str, str] = {KEY_ID: correction.id, KEY_SUMMARY: correction.summary}
                _append_ref(target=table, ref=ref)
                _append_ref(target=section, ref=ref)
                report.append({
                    KEY_ID: correction.id,
                    KEY_SECTION: section["title"],
                    "sectionSlug": section["slug"],
                    "tableId": table["id"],
                    KEY_SUMMARY: correction.summary,
                    KEY_EVIDENCE: correction.evidence,
                    KEY_PDF_PAGE: correction.pdf_page,
                    "originalHeaders": original,
                    "correctedHeaders": list(table["headers"]),
                })
        if matched == 0:
            raise CorrectionError(
                f"correction {correction.id!r} matched no table in section {correction.section!r} "
                f"with headers {list(correction.when_headers)}"
            )
    return report
