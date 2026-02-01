# Data Dictionary - Financial Forecast Tables

## Common Column Types

All monetary values are stored as integers (cents removed, whole dollars only).
Percentages are stored as strings with the `%` symbol (e.g., "25.3%").
Empty cells indicate no value or not applicable for that year.

---

## target_budget_revenues.csv

Revenue projections by source for fiscal years 2025-2030.

| Column | Type | Description |
|--------|------|-------------|
| Category | string | Revenue source name (e.g., "Real Estate Tax", "Earned Income Tax") |
| 2025_Estimate | integer | 2025 estimated revenue amount |
| 2026_Budget | integer | 2026 budgeted revenue amount |
| 2027_Forecast | integer | 2027 forecasted revenue amount |
| 2028_Forecast | integer | 2028 forecasted revenue amount |
| 2029_Forecast | integer | 2029 forecasted revenue amount |
| 2030_Forecast | integer | 2030 forecasted revenue amount |

**Row Count:** 20 rows (18 revenue categories + "Other Taxes" + "Total Revenues")

---

## target_budget_expenditures.csv

Expenditure projections by category for fiscal years 2025-2030.

| Column | Type | Description |
|--------|------|-------------|
| Category | string | Expenditure category (e.g., "Salaries", "Health Benefits") |
| 2025_Estimate | integer | 2025 estimated expenditure amount |
| 2026_Budget | integer | 2026 budgeted expenditure amount |
| 2027_Forecast | integer | 2027 forecasted expenditure amount |
| 2028_Forecast | integer | 2028 forecasted expenditure amount |
| 2029_Forecast | integer | 2029 forecasted expenditure amount |
| 2030_Forecast | integer | 2030 forecasted expenditure amount |

**Row Count:** 8 rows (6 expenditure categories + "Total Expenditures" + "OPERATING RESULT")

---

## target_budget_reserve_fund.csv

Reserve fund balances and transfers for fiscal years 2025-2030.

| Column | Type | Description |
|--------|------|-------------|
| Category | string | Reserve fund item (e.g., "Transfer to PAYGO", "ENDING RESERVE FUND BALANCE") |
| 2025_Estimate | integer | 2025 estimated amount (negative values indicate transfers out) |
| 2026_Budget | integer | 2026 budgeted amount |
| 2027_Forecast | integer | 2027 forecasted amount |
| 2028_Forecast | integer | 2028 forecasted amount |
| 2029_Forecast | integer | 2029 forecasted amount |
| 2030_Forecast | integer | 2030 forecasted amount |

**Row Count:** 8 rows (Beginning Balance + 6 transfer types + Ending Balance)

**Note:** Negative values represent transfers out of the reserve fund.

---

## target_budget_ratios.csv

Financial health ratios as percentages for fiscal years 2025-2030.

| Column | Type | Description |
|--------|------|-------------|
| Category | string | Ratio name |
| 2025_Estimate | string | 2025 ratio as percentage (e.g., "25.3%") |
| 2026_Budget | string | 2026 ratio as percentage |
| 2027_Forecast | string | 2027 ratio as percentage |
| 2028_Forecast | string | 2028 ratio as percentage |
| 2029_Forecast | string | 2029 ratio as percentage |
| 2030_Forecast | string | 2030 ratio as percentage |

**Row Count:** 2 rows

**Categories:**
- `FUND BALANCE AS A % OF EXPENDITURES` - Reserve fund balance divided by total expenditures
- `DEBT SERVICE AS A % OF EXPENDITURES` - Debt service costs divided by total expenditures

---

## by_department.csv

Departmental expenditure forecast for fiscal years 2024-2030.

| Column | Type | Description |
|--------|------|-------------|
| Department | string | Department or bureau name |
| 2024_Actual | integer | 2024 actual expenditure amount |
| 2025_Estimate | integer | 2025 estimated expenditure amount |
| 2026_Budget | integer | 2026 budgeted expenditure amount |
| 2027_Budget | integer | 2027 budgeted expenditure amount |
| 2028_Budget | integer | 2028 budgeted expenditure amount |
| 2029_Budget | integer | 2029 budgeted expenditure amount |
| 2030_Budget | integer | 2030 budgeted expenditure amount |

**Row Count:** 28 rows (27 departments + "Total Expenditures")

**Note:** This table includes 2024 actual data, which is not present in the other tables.
