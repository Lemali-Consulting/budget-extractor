# Extract Grants Workflow

Extracts active grants data and grant-funded position information from the City of Pittsburgh budget document.

## Purpose

This workflow parses `61_Grants.pdf` to extract:
- Grants Office narrative description
- Active grants organized by department (JDE number, funder, description, amounts)
- Grant-funded positions with salary and FTE information

## Input Files

- `input/split-pdf/61_Grants.pdf` - The grants section of the operating budget

## Output Files

```
output/extract_grants/
├── csv/
│   ├── grants.csv              # All active grants (~140 rows)
│   └── grant_positions.csv     # Grant-funded positions (~12 rows)
├── json/
│   └── grants.json             # Complete structured data
├── DATA_DICTIONARY.md
└── README.md
```

## Usage

```bash
uv run python -m workflows.extract_grants.run
```

Or import and run programmatically:

```python
from workflows.extract_grants import run

result = run()
print(result)  # Dict with 'csv' and 'json' keys listing created files
```

## Dependencies

- pdfplumber - PDF text extraction

## Known Limitations

The source PDF has a complex multi-line table layout where each grant's data spans 2-3 visual rows. This makes automatic extraction of the funder and grant_description fields challenging. The JDE numbers, departments, and financial amounts are extracted accurately, but the funder/grant text may contain data from adjacent records. Manual review of these fields may be needed for precision.
