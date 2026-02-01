# Data Dictionary: Special Funds Extraction

## fund_metadata.csv

| Column | Type | Description |
|--------|------|-------------|
| fund_code | string | Unique fund identifier (e.g., "1050263000") |
| fund_name | string | Full name of the trust fund |
| department | string | Responsible city department |
| authorizing_legislation | string | Resolution/ordinance that created the fund |
| description | string | Purpose and scope of the fund |
| revenues_description | string | Description of revenue sources |
| expenditures_description | string | Description of allowable expenditures |
| projected_beginning_balance | float | Fund balance at start of fiscal year |
| projected_ending_balance | float | Fund balance at end of fiscal year |
| revenues_total_2025 | float | Total revenues budgeted for 2025 |
| revenues_total_2026 | float | Total revenues budgeted for 2026 |
| expenditures_total_2025 | float | Total expenditures budgeted for 2025 |
| expenditures_total_2026 | float | Total expenditures budgeted for 2026 |
| net_total_2025 | float | Net (revenues - expenditures) for 2025 |
| net_total_2026 | float | Net (revenues - expenditures) for 2026 |
| source_file | string | Original PDF filename |

## fund_budget_lines.csv

| Column | Type | Description |
|--------|------|-------------|
| fund_code | string | Fund identifier (foreign key to metadata) |
| fund_name | string | Fund name for convenience |
| section | string | "revenues", "expenditures", or "net" |
| subclass_code | string | 2-digit category code (e.g., "51" for Personnel) or "TOTAL" |
| subclass_name | string | Category name (e.g., "PERSONNEL-SALARIES & WAGES") |
| account_code | string | 5-digit detail account code, null for headers/totals |
| account_name | string | Detail account name, null for headers/totals |
| budget_2025 | float | Budgeted amount for 2025, null if not applicable |
| budget_2026 | float | Budgeted amount for 2026, null if not applicable |
| change_amount | float | Dollar change (2026 - 2025), null if not shown |
| change_percent | float | Percent change, null if not shown |
| line_type | string | "section_header", "detail", or "total" |

### Subclass Codes

**Revenue subclasses (41-48):**
- 41: Tax Revenue
- 42: Licenses & Permits
- 43: Charges for Services
- 44: Fines & Forfeitures
- 45: Intergovernmental Revenue
- 47: Interest Earnings
- 48: Miscellaneous Revenues

**Expenditure subclasses (51-91):**
- 51: Personnel - Salaries & Wages
- 52: Personnel - Employee Benefits
- 53: Professional & Technical Services
- 54: Property Services
- 55: Other Services
- 56: Supplies
- 57: Property
- 58: Miscellaneous
- 91: Transfers Out

## fund_positions.csv

| Column | Type | Description |
|--------|------|-------------|
| fund_code | string | Fund identifier (foreign key to metadata) |
| fund_name | string | Fund name for convenience |
| department | string | Department name if specified |
| division | string | Division/unit within department |
| title | string | Position title |
| fte_2025 | float | Full-time equivalent count for 2025 |
| grade | string | Salary grade (e.g., "27G") or hourly rate |
| hours_months_2025 | string | Hours or months worked in 2025 |
| budget_2025 | float | Total budget for position in 2025 |
| fte_2026 | float | Full-time equivalent count for 2026 |
| hours_months_2026 | string | Hours or months worked in 2026 |
| budget_2026 | float | Total budget for position in 2026 |
| position_type | string | "permanent" or "temporary" |

## JSON File Structure

Each per-fund JSON file contains:

```json
{
  "metadata": { /* same fields as fund_metadata.csv */ },
  "budget_lines": [ /* array of budget line objects */ ],
  "positions": [ /* array of position objects */ ],
  "source_file": "filename.pdf"
}
```

## Null Values

- Null values indicate data not present or not applicable
- Amount fields may be null for em-dash ("—") entries in source
- Percent change may be null when shown as "—%" in source
