# Budget Extractor

Extracts tabular data from City of Pittsburgh Operating Budget PDFs into structured CSV files.

## Requirements

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager

## Installation

```bash
uv sync
```

## Workflows

### Extract Revenue Tables

Extracts revenue account data from `08_Revenue_Detail.pdf` into 7 CSVs by section.

```bash
uv run python -m workflows.extract_revenue_tables.run
```

Output: `output/extract_revenue_tables/`

### Extract Expenditure Tables

Extracts expenditure account data from `11_Expenditures_Detail.pdf` into 9 CSVs by section.

```bash
uv run python -m workflows.extract_expenditure_tables.run
```

Output: `output/extract_expenditure_tables/`

## Project Structure

```
input/              # Raw PDF files
output/             # Extracted CSV data
workflows/          # Self-contained extraction workflows
utils/              # Shared utilities (PDF parsing, CSV writing)
```
