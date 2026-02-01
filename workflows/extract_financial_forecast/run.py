"""Main entry point for the extract_financial_forecast workflow."""

import csv
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


@dataclass
class ForecastRow:
    """A single row from the financial forecast tables."""

    category: str
    values: list[str | None]


def parse_amount(text: str) -> str | None:
    """
    Parse a dollar amount or percentage from text.

    Args:
        text: Raw text that may contain a dollar amount, percentage, or dash.

    Returns:
        Cleaned numeric string, empty string for dashes, or None if unparseable.
    """
    text = text.strip()
    if text in ("—", "-", ""):
        return ""

    # Handle percentages
    if "%" in text:
        return text.replace(" ", "")

    # Handle parentheses (negative numbers)
    is_negative = "(" in text and ")" in text

    # Remove $ signs, parentheses, commas, spaces
    cleaned = re.sub(r"[$(),\s]", "", text)

    if cleaned and cleaned.replace(".", "").isdigit():
        return f"-{cleaned}" if is_negative else cleaned

    return None


def preprocess_text(page_text: str) -> str:
    """
    Preprocess PDF text to join multi-line entries.

    Args:
        page_text: Raw text from the PDF page.

    Returns:
        Text with multi-line entries joined.
    """
    # Join specific multi-line entries
    replacements = [
        ("BEGINNING RESERVE FUND\nBALANCE", "BEGINNING RESERVE FUND BALANCE"),
        ("Transfer to Early Childhood\nCommunity Facilities Fund", "Transfer to Early Childhood Community Facilities Fund"),
        ("Transfer to Housing\nOpportunity Fund", "Transfer to Housing Opportunity Fund"),
        ("FUND BALANCE AS A % OF\nEXPENDITURES", "FUND BALANCE AS A % OF EXPENDITURES"),
        ("DEBT SERVICE AS A % OF\nEXPENDITURES", "DEBT SERVICE AS A % OF EXPENDITURES"),
    ]

    for old, new in replacements:
        page_text = page_text.replace(old, new)

    return page_text


def extract_target_budget_data(page_text: str) -> dict[str, list[ForecastRow]]:
    """
    Extract data from the Target Budget table on page 2.

    Args:
        page_text: Raw text from the PDF page.

    Returns:
        Dictionary with keys 'revenues', 'expenditures', 'reserve_fund', 'ratios'.
    """
    # Preprocess to handle multi-line entries
    page_text = preprocess_text(page_text)
    lines = page_text.split("\n")

    results: dict[str, list[ForecastRow]] = {
        "revenues": [],
        "expenditures": [],
        "reserve_fund": [],
        "ratios": [],
    }

    current_section: str | None = None

    # Revenue items to look for
    revenue_items = [
        "Real Estate Tax",
        "Earned Income Tax",
        "Payroll Preparation Tax",
        "Parking Tax",
        "Regional Asset District Tax Relief",
        "Deed Transfer Tax",
        "Amusement Tax",
        "Local Service Tax",
        "Facility Usage Fee",
        "Telecommunications Licensing Tax",
        "Institution Service Privilege Tax",
        "Non-Profit Payment for Services",
        "Other Taxes",
        "Licenses and Permits",
        "Charges for Services",
        "Fines and Forfeitures",
        "Intergovernmental Revenue",
        "Interest Earnings",
        "Miscellaneous Revenues",
        "Total Revenues",
    ]

    # Expenditure items
    expenditure_items = [
        "Salaries",
        "Health Benefits",
        "Workers' Comp.",
        "Pension & OPEB",
        "Operating Departments",
        "Debt Service",
        "Total Expenditures",
        "OPERATING RESULT",
    ]

    # Reserve fund items
    reserve_items = [
        "BEGINNING RESERVE FUND BALANCE",
        "Transfer to PAYGO",
        "Transfer to Early Childhood Community Facilities Fund",
        "Transfer to Housing Opportunity Fund",
        "Transfer for Housing Issuance",
        "Transfer to Stop the Violence Fund",
        "Transfer to Tech. Modernization Fund",
        "ENDING RESERVE FUND BALANCE",
    ]

    # Ratio items
    ratio_items = [
        "FUND BALANCE AS A % OF EXPENDITURES",
        "DEBT SERVICE AS A % OF EXPENDITURES",
    ]

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Detect section changes
        if line.startswith("REVENUES"):
            current_section = "revenues"
            continue
        elif line.startswith("EXPENDITURES") and "%" not in line:
            current_section = "expenditures"
            continue
        elif "BEGINNING RESERVE FUND" in line:
            current_section = "reserve_fund"
        elif "FUND BALANCE AS A % OF" in line:
            current_section = "ratios"

        # Try to match known items
        matched_item = None
        item_list = []

        if current_section == "revenues":
            item_list = revenue_items
        elif current_section == "expenditures":
            item_list = expenditure_items
        elif current_section == "reserve_fund":
            item_list = reserve_items
        elif current_section == "ratios":
            item_list = ratio_items

        for item in item_list:
            if item in line or line.startswith(item):
                matched_item = item
                break

        if matched_item and current_section:
            # Extract numeric values from the line
            values = extract_values_from_line(line, matched_item)
            if values and any(v is not None for v in values):
                results[current_section].append(ForecastRow(matched_item, values))

    return results


def extract_values_from_line(line: str, category: str) -> list[str | None]:
    """
    Extract the 6 year values from a line.

    Args:
        line: The full line of text.
        category: The category name to remove from the line.

    Returns:
        List of 6 values (2025-2030).
    """
    # Remove the category name to isolate values
    remaining = line
    if category in remaining:
        idx = remaining.find(category) + len(category)
        remaining = remaining[idx:]

    # Find all numeric patterns (including percentages and parenthetical negatives)
    patterns = [
        r"\$?\s*\([\d,]+\)",  # Negative values like (12,704,175)
        r"\$?\s*[\d,]+\.?\d*%?",  # Regular numbers and percentages
        r"—",  # Em dash for empty
    ]

    combined_pattern = "|".join(patterns)
    matches = re.findall(combined_pattern, remaining)

    values: list[str | None] = []
    for match in matches:
        parsed = parse_amount(match)
        if parsed is not None:
            values.append(parsed)

    # Pad to 6 values if needed
    while len(values) < 6:
        values.append(None)

    return values[:6]


def extract_department_data(page_text: str) -> list[ForecastRow]:
    """
    Extract data from the By Department table on page 3.

    Args:
        page_text: Raw text from the PDF page.

    Returns:
        List of ForecastRow objects with 7 values (2024-2030).
    """
    lines = page_text.split("\n")

    departments = [
        "City Council Districts",
        "Office of the City Clerk",
        "Office of the Mayor",
        "Office of Management and Budget",
        "Innovation and Performance",
        "Commission on Human Relations",
        "Office of the City Controller",
        "Finance",
        "Law",
        "Ethics Hearing Board",
        "Office of Municipal Investigations",
        "Human Resources and Civil Service",
        "City Planning",
        "Permits, Licenses, and Inspections",
        "Public Safety Administration",
        "Bureau of Emergency Medical Services",
        "Bureau of Police",
        "Bureau of Fire",
        "Bureau of Animal Care and Control",
        "Office of Community Health and Safety",
        "Public Works Administration",
        "Bureau of Operations",
        "Bureau of Environmental Services",
        "Bureau of Facilities",
        "Parks and Recreation",
        "Mobility and Infrastructure",
        "Citizen Police Review Board",
        "Total Expenditures",
    ]

    results: list[ForecastRow] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        for dept in departments:
            if dept in line or line.startswith(dept):
                # Extract 7 values for 2024-2030
                remaining = line
                if dept in remaining:
                    idx = remaining.find(dept) + len(dept)
                    remaining = remaining[idx:]

                # Find all dollar amounts
                matches = re.findall(r"\$?\s*[\d,]+", remaining)
                values: list[str | None] = []

                for match in matches:
                    parsed = parse_amount(match)
                    if parsed is not None:
                        values.append(parsed)

                # Pad to 7 values
                while len(values) < 7:
                    values.append(None)

                if any(v for v in values):
                    results.append(ForecastRow(dept, values[:7]))
                break

    return results


def write_forecast_csv(
    rows: list[ForecastRow],
    output_path: Path,
    columns: list[str],
) -> None:
    """
    Write forecast rows to a CSV file.

    Args:
        rows: List of ForecastRow objects.
        output_path: Path to output CSV file.
        columns: Column headers for the CSV.
    """
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(columns)

        for row in rows:
            writer.writerow([row.category] + row.values)


def run(
    pdf_path: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> list[Path]:
    """
    Run the financial forecast extraction workflow.

    Args:
        pdf_path: Path to the Five-Year Financial Forecast PDF.
        output_dir: Directory for output CSVs.

    Returns:
        List of paths to created CSV files.
    """
    project_root = Path(__file__).parent.parent.parent

    if pdf_path is None:
        pdf_path = project_root / "input" / "split-pdf" / "04_Five-Year_Financial_Forecast.pdf"
    else:
        pdf_path = Path(pdf_path)

    if output_dir is None:
        output_dir = project_root / "output" / "extract_financial_forecast"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    created_files: list[Path] = []

    with pdfplumber.open(pdf_path) as pdf:
        # Page 2 (index 1) contains Target Budget table
        page2_text = pdf.pages[1].extract_text() or ""

        # Page 3 (index 2) contains By Department table
        page3_text = pdf.pages[2].extract_text() or ""

    # Extract Target Budget data
    target_data = extract_target_budget_data(page2_text)

    target_columns = [
        "Category",
        "2025_Estimate",
        "2026_Budget",
        "2027_Forecast",
        "2028_Forecast",
        "2029_Forecast",
        "2030_Forecast",
    ]

    # Write revenues
    if target_data["revenues"]:
        path = output_dir / "target_budget_revenues.csv"
        write_forecast_csv(target_data["revenues"], path, target_columns)
        created_files.append(path)
        print(f"Created: {path.name} ({len(target_data['revenues'])} rows)")

    # Write expenditures
    if target_data["expenditures"]:
        path = output_dir / "target_budget_expenditures.csv"
        write_forecast_csv(target_data["expenditures"], path, target_columns)
        created_files.append(path)
        print(f"Created: {path.name} ({len(target_data['expenditures'])} rows)")

    # Write reserve fund
    if target_data["reserve_fund"]:
        path = output_dir / "target_budget_reserve_fund.csv"
        write_forecast_csv(target_data["reserve_fund"], path, target_columns)
        created_files.append(path)
        print(f"Created: {path.name} ({len(target_data['reserve_fund'])} rows)")

    # Write ratios
    if target_data["ratios"]:
        path = output_dir / "target_budget_ratios.csv"
        write_forecast_csv(target_data["ratios"], path, target_columns)
        created_files.append(path)
        print(f"Created: {path.name} ({len(target_data['ratios'])} rows)")

    # Extract and write department data
    dept_data = extract_department_data(page3_text)

    dept_columns = [
        "Department",
        "2024_Actual",
        "2025_Estimate",
        "2026_Budget",
        "2027_Budget",
        "2028_Budget",
        "2029_Budget",
        "2030_Budget",
    ]

    if dept_data:
        path = output_dir / "by_department.csv"
        write_forecast_csv(dept_data, path, dept_columns)
        created_files.append(path)
        print(f"Created: {path.name} ({len(dept_data)} rows)")

    print(f"\nTotal: {len(created_files)} CSV files created in {output_dir}")

    return created_files


if __name__ == "__main__":
    run()
