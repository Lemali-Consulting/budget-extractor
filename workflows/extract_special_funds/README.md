# Extract Special Funds Workflow

Extracts structured data from City of Pittsburgh special/trust fund budget PDFs.

## Purpose

This workflow parses special revenue fund documents to extract:
- Fund metadata (name, code, department, authorizing legislation, descriptions)
- Budget line items (revenues and expenditures with 2025/2026 comparisons)
- Position/staffing data (where available)

## Input Files

PDF files from `input/split-pdf/`:
- 42_HUD_Fair_Housing_Program_Trust_Fund.pdf
- 43_EEOC_Trust_Fund.pdf
- 44_Three_Taxing_Bodies_Trust_Fund.pdf
- 45_Pittsburgh_Partnership_Trust_Fund.pdf
- 46_Community_Development_Trust_Fund.pdf
- 47_Police_Secondary_Employment_Trust_Fund.pdf
- 48_Stop_the_Violence_Trust_Fund.pdf
- 49_Liquid_Fuels_Trust_Fund.pdf
- 50_Regional_Asset_District_-_Public_Works_Trust_Fund.pdf
- 51_Public_Works_Trust_Fund.pdf
- 52_Shade_Tree_Trust_Fund.pdf
- 53_Parks_Tax_Trust_Fund.pdf
- 54_Special_Events_Trust_Fund.pdf
- 55_Regional_Asset_District_-_Parks_and_Recreation_Trust_Fund.pdf
- 56_Mellon_Park_Trust_Fund.pdf
- 57_Schenley_Park_Rink_Trust_Fund.pdf
- 58_Senior_Citizens_Program_Trust_Fund.pdf
- 59_Special_Food_Service_Trust_Fund.pdf
- 60_Frick_Park_Trust_Fund.pdf

## Output Files

### CSV Format (Aggregated)
Located in `output/extract_special_funds/csv/`:
- `fund_metadata.csv` - One row per fund with descriptive fields
- `fund_budget_lines.csv` - All revenue/expenditure line items across all funds
- `fund_positions.csv` - Position/staffing data (funds that have it)

### JSON Format (Per-Fund)
Located in `output/extract_special_funds/json/`:
- One JSON file per fund (e.g., `42_HUD_Fair_Housing_Program_Trust_Fund.json`)
- Contains complete nested structure with metadata, budget lines, and positions

## Usage

```python
from workflows.extract_special_funds import run

# Run with defaults
created_files = run()

# Or specify custom paths
created_files = run(
    input_dir="path/to/pdfs",
    output_dir="path/to/output"
)
```

Or run directly:
```bash
python -m workflows.extract_special_funds.run
```

## Workflow Overview

1. Load each special fund PDF using pdfplumber
2. Extract metadata from labeled fields (Department, Description, etc.)
3. Parse budget tables for revenue/expenditure line items
4. Parse position summary tables where present
5. Output aggregated CSVs and individual JSON files

## Dependencies

- pdfplumber: PDF text extraction
