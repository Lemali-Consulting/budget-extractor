# Data Dictionary - Extract Grants

## grants.csv

| Column | Type | Description |
|--------|------|-------------|
| department | string | City department or bureau responsible for the grant |
| jde_number | string | JD Edwards system identifier (9-10 digit code) |
| funder | string | Organization providing the grant funding |
| grant_description | string | Brief description of the grant purpose |
| amount_awarded | float | Total grant amount awarded (dollars) |
| amount_spent | float | Amount spent as of November 1, 2025 (dollars). May be negative if overspent. |
| remaining_balance | float | Remaining grant balance (dollars). May be negative. |

### Notes
- All amounts are in US dollars
- Null values indicate the amount was displayed as "—" in the source document
- Amount Spent + Remaining Balance should approximately equal Amount Awarded
- **Data Quality Note**: Due to the complex multi-line table layout in the source PDF, the funder and grant_description fields may contain text from adjacent records. The JDE number, department, and amounts are extracted accurately. Manual review may be needed for funder/grant text.

## grant_positions.csv

| Column | Type | Description |
|--------|------|-------------|
| jde_number | string | JD Edwards grant identifier this position is funded by |
| program_name | string | Name of the grant program (from Position Summary header) |
| title | string | Position title |
| fte_2025 | float | Full-time equivalent count for 2025 |
| grade_2025 | string | Pay grade for 2025 (e.g., "31E", "23G"). Null if not graded. |
| hours_months_2025 | string | Hours or months worked in 2025 |
| budget_2025 | float | Total budgeted salary for 2025 (dollars) |
| fte_2026 | float | Full-time equivalent count for 2026 |
| grade_2026 | string | Pay grade for 2026. Null if not graded. |
| hours_months_2026 | string | Hours or months worked in 2026 |
| budget_2026 | float | Total budgeted salary for 2026 (dollars) |

### Notes
- FTE values represent full-time equivalent positions (1.0 = one full-time position)
- Grade codes follow City of Pittsburgh pay scale (e.g., "23G", "29G", "31E")
- Hours/months typically shows "12" for year-round positions or "3" for short-term fellowships

## grants.json

Complete JSON export containing:
- `narrative`: Grants Office description text
- `grants`: Array of all grant line items
- `positions`: Array of all grant-funded positions
- `source_file`: Name of the source PDF file
