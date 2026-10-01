"""Build cleaned capital-budget-appendix data for the web app.

Reads the source Capital Budget Appendices PDF and emits a single JSON view
file with the three appendices (A: Projects by Department, B: CPFC Scoring,
C: Glossary) as structured rows — bypassing the spatial table extractor,
which fragments these pages into dozens of mis-ordered tables."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.capital_appendices import (
    parse_appendix_a,
    parse_appendix_b,
    parse_appendix_c,
)
from utils.paths import PROJECT_ROOT, split_pdf_dir


APPENDIX_PDF = "64_Capital_Budget_Appendices.pdf"


def build(year: int) -> Path:
    pdf_path = split_pdf_dir(year, "capital") / APPENDIX_PDF
    if not pdf_path.exists():
        raise FileNotFoundError(f"Source PDF not found: {pdf_path}")

    output = {
        "appendix_a": parse_appendix_a(pdf_path),
        "appendix_b": parse_appendix_b(pdf_path),
        "appendix_c": parse_appendix_c(pdf_path),
    }

    prefix = "" if year == 2026 else f"{year}-"
    out_path = PROJECT_ROOT / "web/src/data/views" / f"{prefix}capital-appendices.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    return out_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=2026)
    args = ap.parse_args()
    out = build(args.year)
    a_count = sum(len(d["projects"]) for d in json.loads(out.read_text())["appendix_a"]["departments"])
    b_count = len(json.loads(out.read_text())["appendix_b"]["scoring"])
    c_count = len(json.loads(out.read_text())["appendix_c"]["entries"])
    print(f"Wrote {out}")
    print(f"  Appendix A: {a_count} projects")
    print(f"  Appendix B: {b_count} scoring rows")
    print(f"  Appendix C: {c_count} glossary entries")


if __name__ == "__main__":
    main()
