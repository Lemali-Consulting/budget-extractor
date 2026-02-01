# Extract Expenditure Tables Workflow

Extracts expenditure account summary tables from the Expenditures Detail PDF and outputs separate CSV files for each expenditure section.

## Input Files
- `input/split-pdf/11_Expenditures_Detail.pdf` - The expenditure detail section of the operating budget

## Output Files
- `output/extract_expenditure_tables/51_personnel_salaries.csv`
- `output/extract_expenditure_tables/52_personnel_benefits.csv`
- `output/extract_expenditure_tables/53_professional_services.csv`
- `output/extract_expenditure_tables/54_property_services.csv`
- `output/extract_expenditure_tables/55_other_services.csv`
- `output/extract_expenditure_tables/56_supplies.csv`
- `output/extract_expenditure_tables/57_property.csv`
- `output/extract_expenditure_tables/58_miscellaneous.csv`
- `output/extract_expenditure_tables/82_debt_service.csv`

## Overview
1. Reads the multi-page Expenditures Detail PDF using pdfplumber
2. Extracts text and parses the tabular expenditure data
3. Groups line items by their 2-digit section code (51, 52, 53, etc.)
4. Outputs each section as a separate CSV with columns: Account, 2026, 2027, 2028, 2029, 2030

## Dependencies
- pdfplumber
- utils.budget_table_parser
- utils.csv_writer
