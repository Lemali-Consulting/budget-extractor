"""Main entry point for the extract_special_funds workflow."""

import csv
import json
from dataclasses import asdict
from pathlib import Path

from .extractor import SpecialFundExtractor
from .models import SpecialFund


# List of special fund PDF files to process
SPECIAL_FUND_FILES: list[str] = [
    "42_HUD_Fair_Housing_Program_Trust_Fund.pdf",
    "43_EEOC_Trust_Fund.pdf",
    "44_Three_Taxing_Bodies_Trust_Fund.pdf",
    "45_Pittsburgh_Partnership_Trust_Fund.pdf",
    "46_Community_Development_Trust_Fund.pdf",
    "47_Police_Secondary_Employment_Trust_Fund.pdf",
    "48_Stop_the_Violence_Trust_Fund.pdf",
    "49_Liquid_Fuels_Trust_Fund.pdf",
    "50_Regional_Asset_District_-_Public_Works_Trust_Fund.pdf",
    "51_Public_Works_Trust_Fund.pdf",
    "52_Shade_Tree_Trust_Fund.pdf",
    "53_Parks_Tax_Trust_Fund.pdf",
    "54_Special_Events_Trust_Fund.pdf",
    "55_Regional_Asset_District_-_Parks_and_Recreation_Trust_Fund.pdf",
    "56_Mellon_Park_Trust_Fund.pdf",
    "57_Schenley_Park_Rink_Trust_Fund.pdf",
    "58_Senior_Citizens_Program_Trust_Fund.pdf",
    "59_Special_Food_Service_Trust_Fund.pdf",
    "60_Frick_Park_Trust_Fund.pdf",
]


def run(
    input_dir: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> dict[str, list[Path]]:
    """
    Run the special fund extraction workflow.

    Extracts data from all special/trust fund PDFs and outputs both
    CSV files (aggregated) and JSON files (per-fund).

    Args:
        input_dir: Directory containing split PDF files. Defaults to standard location.
        output_dir: Directory for output files. Defaults to standard location.

    Returns:
        Dictionary with 'csv' and 'json' keys mapping to lists of created file paths.
    """
    project_root = Path(__file__).parent.parent.parent

    if input_dir is None:
        input_dir = project_root / "input" / "split-pdf"
    else:
        input_dir = Path(input_dir)

    if output_dir is None:
        output_dir = project_root / "output" / "extract_special_funds"
    else:
        output_dir = Path(output_dir)

    # Create output directories
    csv_dir = output_dir / "csv"
    json_dir = output_dir / "json"
    csv_dir.mkdir(parents=True, exist_ok=True)
    json_dir.mkdir(parents=True, exist_ok=True)

    # Extract all funds
    funds: list[SpecialFund] = []
    for filename in SPECIAL_FUND_FILES:
        pdf_path = input_dir / filename
        if not pdf_path.exists():
            print(f"Warning: {filename} not found, skipping")
            continue

        print(f"Extracting: {filename}")
        try:
            extractor = SpecialFundExtractor(pdf_path)
            fund = extractor.extract()
            funds.append(fund)
        except Exception as e:
            print(f"  Error: {e}")
            continue

    print(f"\nExtracted {len(funds)} funds")

    # Write outputs
    created_files: dict[str, list[Path]] = {"csv": [], "json": []}

    # Write CSV files
    csv_files = _write_csv_files(funds, csv_dir)
    created_files["csv"].extend(csv_files)

    # Write JSON files
    json_files = _write_json_files(funds, json_dir)
    created_files["json"].extend(json_files)

    print(f"\nCreated {len(csv_files)} CSV files in {csv_dir}")
    print(f"Created {len(json_files)} JSON files in {json_dir}")

    return created_files


def _write_csv_files(funds: list[SpecialFund], output_dir: Path) -> list[Path]:
    """Write aggregated CSV files for all funds."""
    created: list[Path] = []

    # Write fund_metadata.csv
    metadata_path = output_dir / "fund_metadata.csv"
    with open(metadata_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "fund_code",
            "fund_name",
            "department",
            "authorizing_legislation",
            "description",
            "revenues_description",
            "expenditures_description",
            "projected_beginning_balance",
            "projected_ending_balance",
            "revenues_total_2025",
            "revenues_total_2026",
            "expenditures_total_2025",
            "expenditures_total_2026",
            "net_total_2025",
            "net_total_2026",
            "source_file",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for fund in funds:
            row = asdict(fund.metadata)
            row["source_file"] = fund.source_file
            writer.writerow(row)

    created.append(metadata_path)
    print(f"  Created: fund_metadata.csv ({len(funds)} rows)")

    # Write fund_budget_lines.csv
    budget_path = output_dir / "fund_budget_lines.csv"
    budget_count = 0
    with open(budget_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "fund_code",
            "fund_name",
            "section",
            "subclass_code",
            "subclass_name",
            "account_code",
            "account_name",
            "budget_2025",
            "budget_2026",
            "change_amount",
            "change_percent",
            "line_type",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for fund in funds:
            for item in fund.budget_lines:
                row = asdict(item)
                row["fund_code"] = fund.metadata.fund_code
                row["fund_name"] = fund.metadata.fund_name
                writer.writerow(row)
                budget_count += 1

    created.append(budget_path)
    print(f"  Created: fund_budget_lines.csv ({budget_count} rows)")

    # Write fund_positions.csv (only if there are positions)
    all_positions = [
        (fund, pos) for fund in funds for pos in fund.positions
    ]
    if all_positions:
        positions_path = output_dir / "fund_positions.csv"
        with open(positions_path, "w", newline="", encoding="utf-8") as f:
            fieldnames = [
                "fund_code",
                "fund_name",
                "department",
                "division",
                "title",
                "fte_2025",
                "grade",
                "hours_months_2025",
                "budget_2025",
                "fte_2026",
                "hours_months_2026",
                "budget_2026",
                "position_type",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for fund, pos in all_positions:
                row = asdict(pos)
                row["fund_code"] = fund.metadata.fund_code
                row["fund_name"] = fund.metadata.fund_name
                writer.writerow(row)

        created.append(positions_path)
        print(f"  Created: fund_positions.csv ({len(all_positions)} rows)")

    return created


def _write_json_files(funds: list[SpecialFund], output_dir: Path) -> list[Path]:
    """Write individual JSON files for each fund."""
    created: list[Path] = []

    for fund in funds:
        # Create filename from source file
        base_name = Path(fund.source_file).stem
        json_path = output_dir / f"{base_name}.json"

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(fund.to_dict(), f, indent=2)

        created.append(json_path)

    return created


if __name__ == "__main__":
    run()
