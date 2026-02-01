# Data Dictionary: Revenue Tables

## File Structure

Each CSV contains one revenue section from the City of Pittsburgh Operating Budget. Files are named by section code and category (e.g., `41_tax_revenue.csv`).

## Columns

| Column | Type | Description |
|--------|------|-------------|
| Account Code | String | 2-digit for section totals, 5-digit for line items |
| Account Name | String | Description of the revenue source |
| 2026 | String | Projected revenue for fiscal year 2026 (formatted with commas) |
| 2027 | String | Projected revenue for fiscal year 2027 (formatted with commas) |
| 2028 | String | Projected revenue for fiscal year 2028 (formatted with commas) |
| 2029 | String | Projected revenue for fiscal year 2029 (formatted with commas) |
| 2030 | String | Projected revenue for fiscal year 2030 (formatted with commas) |

## Row Types

- **Section Total** (first row): 2-digit account code (e.g., `41`). Contains the sum of all line items in that section.
- **Line Item** (remaining rows): 5-digit account code (e.g., `41101`). Individual revenue accounts.

## Sections

| Code | File | Category |
|------|------|----------|
| 41 | `41_tax_revenue.csv` | Tax Revenue |
| 42 | `42_licenses_permits.csv` | Licenses & Permits Revenue |
| 43 | `43_charges_for_services.csv` | Charges for Services |
| 44 | `44_fines_forfeitures.csv` | Fines & Forfeitures |
| 45 | `45_intergovernmental.csv` | Intergovernmental Revenue |
| 47 | `47_interest_earnings.csv` | Interest Earnings |
| 48 | `48_miscellaneous.csv` | Miscellaneous Revenues |
