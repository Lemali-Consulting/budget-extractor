"""Main entry point for the extract_expenditure_tables workflow."""

from pathlib import Path

from utils import BudgetTableParser, write_section_csv


# Section definitions mapping 2-digit codes to section info
SECTIONS: dict[str, tuple[str, str]] = {
    "51": ("PERSONNEL-SALARIES & WAGES", "51_personnel_salaries"),
    "52": ("PERSONNEL-EMPLOYEE BENEFITS", "52_personnel_benefits"),
    "53": ("PROFESSIONAL & TECHNICAL SERVICES", "53_professional_services"),
    "54": ("PROPERTY SERVICES", "54_property_services"),
    "55": ("OTHER SERVICES", "55_other_services"),
    "56": ("SUPPLIES", "56_supplies"),
    "57": ("PROPERTY", "57_property"),
    "58": ("MISCELLANEOUS", "58_miscellaneous"),
    "82": ("DEBT SERVICE", "82_debt_service"),
}


def run(
    pdf_path: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> list[Path]:
    """
    Run the expenditure table extraction workflow.

    Args:
        pdf_path: Path to the Expenditures Detail PDF. Defaults to standard location.
        output_dir: Directory for output CSVs. Defaults to standard location.

    Returns:
        List of paths to created CSV files.
    """
    project_root = Path(__file__).parent.parent.parent

    if pdf_path is None:
        pdf_path = project_root / "input" / "split-pdf" / "11_Expenditures_Detail.pdf"
    else:
        pdf_path = Path(pdf_path)

    if output_dir is None:
        output_dir = project_root / "output" / "extract_expenditure_tables"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Configure parser for expenditure tables
    header_patterns = [
        r'^Expenditure Account Summary$',
        r'^Account\s+2026\s+2027',
        r'^Expenditures$',
    ]
    total_pattern = r'^Expenditures Total\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)\s+\$\s*([\d,]+)'

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
