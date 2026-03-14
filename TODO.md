# TODO

## Efficiency Improvements for Table Extraction QA

### 1. Reference-First Workflow
Instead of running the extractor and then iterating on errors, create (or hand-correct) a small expected CSV for a new PDF *before* iterating on the code. The development loop becomes: run extractor → diff against expected → fix code → re-run. This removes back-and-forth since the diff tells us immediately what's wrong.

### 2. Bulk Visual QA Report
Run the extractor across all PDFs and generate a summary report that flags tables with suspicious patterns:
- Single-cell rows
- Labels appearing in number columns
- Columns with >50% empty cells
- Total-row misalignment (label + number in same cell)
- Columns that cut through text content

This lets the human triage problems quickly rather than examining every CSV line-by-line.

### 3. PDF-to-Image Comparison
Render each extracted table back as a formatted grid overlaid on the original PDF page. Visual verification of a highlighted overlay is much faster than reading raw CSVs.

### 4. Semantic Validation Checks
Add automated assertions that catch common failure modes without needing per-PDF expected files:
- Every row labeled "Total" should have a number in the first numeric column
- The label column (C0) should never contain comma-formatted numbers
- No cell should contain both a label and a number (e.g., "Revenues Total 160,000")
- Column boundaries should not bisect words in more than a small percentage of rows
- Single-column tables should be rejected
- Whitespace-only columns should be flagged
