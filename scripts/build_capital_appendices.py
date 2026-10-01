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
    find_appendix_pdf,
    parse_appendix_a,
    parse_appendix_b,
    parse_appendix_c,
)
from utils.paths import DEFAULT_YEAR, PROJECT_ROOT, variant_paths


CAPITAL_BUDGET_TYPE: str = "capital"


def build(*, year: int, variant: str, output_prefix: str) -> Path:
    """Parse the appendices PDF for a year/variant and write the views JSON ('2025' -> '2025-capital-appendices.json')."""
    pdf_path: Path = find_appendix_pdf(
        variant_paths(year=year, budget_type=CAPITAL_BUDGET_TYPE, variant=variant).split_dir
    )

    output = {
        "appendix_a": parse_appendix_a(pdf_path),
        "appendix_b": parse_appendix_b(pdf_path),
        "appendix_c": parse_appendix_c(pdf_path),
    }

    file_prefix: str = f"{output_prefix}-" if output_prefix else ""
    out_path = PROJECT_ROOT / "web/src/data/views" / f"{file_prefix}capital-appendices.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    return out_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, default=DEFAULT_YEAR)
    ap.add_argument("--variant", default="adopted", help="Capital budget variant (default: adopted)")
    ap.add_argument("--output-prefix", default="",
                    help="Filename prefix, e.g. '2025' -> '2025-capital-appendices.json' (default: none)")
    args = ap.parse_args()
    out = build(year=args.year, variant=args.variant, output_prefix=args.output_prefix)
    a_count = sum(len(d["projects"]) for d in json.loads(out.read_text())["appendix_a"]["departments"])
    b_count = len(json.loads(out.read_text())["appendix_b"]["scoring"])
    c_count = len(json.loads(out.read_text())["appendix_c"]["entries"])
    print(f"Wrote {out}")
    print(f"  Appendix A: {a_count} projects")
    print(f"  Appendix B: {b_count} scoring rows")
    print(f"  Appendix C: {c_count} glossary entries")


if __name__ == "__main__":
    main()
