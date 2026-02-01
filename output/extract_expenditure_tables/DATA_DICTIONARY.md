# Data Dictionary: Expenditure Tables

## File Structure

Each CSV contains one expenditure section from the City of Pittsburgh Operating Budget. Files are named by section code and category (e.g., `51_personnel_salaries.csv`).

## Columns

| Column | Type | Description |
|--------|------|-------------|
| Account Code | String | 2-digit for section totals, 5-digit for line items |
| Account Name | String | Description of the expenditure category |
| 2026 | String | Budgeted expenditure for fiscal year 2026 (formatted with commas) |
| 2027 | String | Budgeted expenditure for fiscal year 2027 (formatted with commas) |
| 2028 | String | Budgeted expenditure for fiscal year 2028 (formatted with commas) |
| 2029 | String | Budgeted expenditure for fiscal year 2029 (formatted with commas) |
| 2030 | String | Budgeted expenditure for fiscal year 2030 (formatted with commas) |

## Row Types

- **Section Total** (first row): 2-digit account code (e.g., `51`). Contains the sum of all line items in that section.
- **Line Item** (remaining rows): 5-digit account code (e.g., `51101`). Individual expenditure accounts.

## Sections

| Code | File | Category |
|------|------|----------|
| 51 | `51_personnel_salaries.csv` | Personnel - Salaries & Wages |
| 52 | `52_personnel_benefits.csv` | Personnel - Employee Benefits |
| 53 | `53_professional_services.csv` | Professional & Technical Services |
| 54 | `54_property_services.csv` | Property Services |
| 55 | `55_other_services.csv` | Other Services |
| 56 | `56_supplies.csv` | Supplies |
| 57 | `57_property.csv` | Property |
| 58 | `58_miscellaneous.csv` | Miscellaneous |
| 82 | `82_debt_service.csv` | Debt Service |
