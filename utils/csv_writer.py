"""Shared CSV writing utilities for budget data."""

import csv
from pathlib import Path

from .budget_table_parser import BudgetLineItem


def write_section_csv(
    items: list[BudgetLineItem],
    output_path: Path,
) -> Path:
    """
    Write a section's line items to a CSV file.

    Args:
        items: List of line items for this section.
        output_path: Full path to the output CSV file.

    Returns:
        Path to the created CSV file.
    """
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)

        writer.writerow(['Account Code', 'Account Name', '2026', '2027', '2028', '2029', '2030'])

        for item in items:
            writer.writerow([
                item.account_code,
                item.account_name,
                item.year_2026,
                item.year_2027,
                item.year_2028,
                item.year_2029,
                item.year_2030,
            ])

    return output_path
