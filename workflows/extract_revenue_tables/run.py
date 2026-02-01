"""Main entry point for the extract_revenue_tables workflow."""

from pathlib import Path

from utils import BudgetTableParser, write_section_csv


# Section definitions mapping 2-digit codes to section info
SECTIONS: dict[str, tuple[str, str]] = {
    "41": ("TAX REVENUE", "41_tax_revenue"),
    "42": ("LICENSES & PERMITS REVENUE", "42_licenses_permits"),
    "43": ("CHARGES FOR SERVICES", "43_charges_for_services"),
    "44": ("FINES & FORFEITURES", "44_fines_forfeitures"),
    "45": ("INTERGOVERNMENTAL REVENUE", "45_intergovernmental"),
    "47": ("INTEREST EARNINGS", "47_interest_earnings"),
    "48": ("MISCELLANEOUS REVENUES", "48_miscellaneous"),
}


def run(
    pdf_path: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> list[Path]:
    """
    Run the revenue table extraction workflow.

    Args:
        pdf_path: Path to the Revenue Detail PDF. Defaults to standard location.
        output_dir: Directory for output CSVs. Defaults to standard location.

    Returns:
        List of paths to created CSV files.
    """
    project_root = Path(__file__).parent.parent.parent

    if pdf_path is None:
        pdf_path = project_root / "input" / "split-pdf" / "08_Revenue_Detail.pdf"
    else:
        pdf_path = Path(pdf_path)

    if output_dir is None:
        output_dir = project_root / "output" / "extract_revenue_tables"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Configure parser for revenue tables
    header_patterns = [
        r'^Revenue Account Summary$',
        r'^Account\s+2026\s+2027',
        r'^Revenue$',
        r'^Totals may not sum',
    ]
    total_pattern = r'^Total Revenue\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)'

    parser = BudgetTableParser(
        pdf_path,
        header_patterns=header_patterns,
        total_pattern=total_pattern,
    )

    all_items = parser.extract_all_lines()
    sections = parser.group_by_section(all_items)

    created_files: list[Path] = []

    for section_code in sorted(sections.keys()):
        items = sections[section_code]

        if section_code in SECTIONS:
            _, filename_base = SECTIONS[section_code]
            filename = f"{filename_base}.csv"
        else:
            filename = f"{section_code}_unknown.csv"

        output_path = output_dir / filename
        write_section_csv(items, output_path)
        created_files.append(output_path)
        print(f"Created: {output_path.name} ({len(items)} rows)")

    print(f"\nTotal: {len(created_files)} CSV files created in {output_dir}")

    return created_files


if __name__ == "__main__":
    run()
