# Extract Financial Forecast Workflow

Extracts data from the Five-Year Financial Forecast PDF into structured CSV files.

## Purpose

Parses the Target Budget and By Department tables from the financial forecast section, producing separate CSVs for revenues, expenditures, reserve fund transfers, financial ratios, and departmental breakdowns.

## Input Files

- `input/split-pdf/04_Five-Year_Financial_Forecast.pdf` - Pages 2-3 contain the data tables

## Output Files

All outputs are written to `output/extract_financial_forecast/`:

| File | Description |
|------|-------------|
| `target_budget_revenues.csv` | Revenue projections by source (2025-2030) |
| `target_budget_expenditures.csv` | Expenditure projections by category (2025-2030) |
| `target_budget_reserve_fund.csv` | Reserve fund transfers and balances (2025-2030) |
| `target_budget_ratios.csv` | Financial health ratios as percentages (2025-2030) |
| `by_department.csv` | Departmental expenditure forecast (2024-2030) |

## Running the Workflow

```bash
uv run python -m workflows.extract_financial_forecast.run
```

## Dependencies

- `pdfplumber` - PDF text extraction
