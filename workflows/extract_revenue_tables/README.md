# Extract Revenue Tables Workflow

Extracts revenue account summary tables from the Revenue Detail PDF and outputs separate CSV files for each revenue section.

## Input Files
- `input/split-pdf/08_Revenue_Detail.pdf` - The revenue detail section of the operating budget

## Output Files
- `output/extract_revenue_tables/41_tax_revenue.csv`
- `output/extract_revenue_tables/42_licenses_permits.csv`
- `output/extract_revenue_tables/43_charges_for_services.csv`
- `output/extract_revenue_tables/44_fines_forfeitures.csv`
- `output/extract_revenue_tables/45_intergovernmental.csv`
- `output/extract_revenue_tables/47_interest_earnings.csv`
- `output/extract_revenue_tables/48_miscellaneous.csv`

## Overview
1. Reads the multi-page Revenue Detail PDF using pdfplumber
2. Extracts text and parses the tabular revenue data
3. Groups line items by their 2-digit section code (41, 42, 43, etc.)
4. Outputs each section as a separate CSV with columns: Account, 2026, 2027, 2028, 2029, 2030

## Dependencies
- pdfplumber
- utils.budget_table_parser
- utils.csv_writer
