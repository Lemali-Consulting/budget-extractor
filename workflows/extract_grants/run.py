"""Main entry point for the extract_grants workflow."""

import csv
import json
from dataclasses import asdict
from pathlib import Path

from .extractor import GrantsExtractor
from .models import GrantsData


# The grants PDF file to process
GRANTS_FILE: str = "61_Grants.pdf"


def run(
    input_dir: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> dict[str, list[Path]]:
    """
    Run the grants extraction workflow.

    Extracts data from the grants PDF and outputs both CSV and JSON files.

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
        output_dir = project_root / "output" / "extract_grants"
    else:
        output_dir = Path(output_dir)

    # Create output directories
    csv_dir = output_dir / "csv"
    json_dir = output_dir / "json"
    csv_dir.mkdir(parents=True, exist_ok=True)
    json_dir.mkdir(parents=True, exist_ok=True)

    # Extract grants data
    pdf_path = input_dir / GRANTS_FILE
    if not pdf_path.exists():
        raise FileNotFoundError(f"Grants PDF not found: {pdf_path}")

    print(f"Extracting: {GRANTS_FILE}")
    extractor = GrantsExtractor(pdf_path)
    data = extractor.extract()

    print(f"  Found {len(data.grants)} grants")
    print(f"  Found {len(data.positions)} grant-funded positions")

    # Write outputs
    created_files: dict[str, list[Path]] = {"csv": [], "json": []}

    # Write CSV files
    csv_files = _write_csv_files(data, csv_dir)
    created_files["csv"].extend(csv_files)

    # Write JSON file
    json_files = _write_json_files(data, json_dir)
    created_files["json"].extend(json_files)

    print(f"\nCreated {len(csv_files)} CSV files in {csv_dir}")
    print(f"Created {len(json_files)} JSON files in {json_dir}")

    return created_files


def _write_csv_files(data: GrantsData, output_dir: Path) -> list[Path]:
    """Write CSV files for grants and positions."""
    created: list[Path] = []

    # Write grants.csv
    grants_path = output_dir / "grants.csv"
    with open(grants_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "department",
            "jde_number",
            "funder",
            "grant_description",
            "amount_awarded",
            "amount_spent",
            "remaining_balance",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for grant in data.grants:
            writer.writerow(asdict(grant))

    created.append(grants_path)
    print(f"  Created: grants.csv ({len(data.grants)} rows)")

    # Write grant_positions.csv
    if data.positions:
        positions_path = output_dir / "grant_positions.csv"
        with open(positions_path, "w", newline="", encoding="utf-8") as f:
            fieldnames = [
                "jde_number",
                "program_name",
                "title",
                "fte_2025",
                "grade_2025",
                "hours_months_2025",
                "budget_2025",
                "fte_2026",
                "grade_2026",
                "hours_months_2026",
                "budget_2026",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for position in data.positions:
                writer.writerow(asdict(position))

        created.append(positions_path)
        print(f"  Created: grant_positions.csv ({len(data.positions)} rows)")

    return created


def _write_json_files(data: GrantsData, output_dir: Path) -> list[Path]:
    """Write JSON file with complete grants data."""
    created: list[Path] = []

    json_path = output_dir / "grants.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data.to_dict(), f, indent=2)

    created.append(json_path)
    print(f"  Created: grants.json")

    return created


if __name__ == "__main__":
    run()
