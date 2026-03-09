---
name: add-regression-pdf
description: Add a new split PDF to regression testing — extract, inspect, fix, and baseline. Use when the user wants to test the extractor on a new PDF section or add it to expected outputs.
---

# Add a PDF Section to Regression Testing

The user wants to run the spatial table extractor on a PDF from `input/split-pdf/`,
inspect the results, iterate on any extraction issues, and optionally promote the
output to regression baselines.

The PDF to process is: `$ARGUMENTS`
(If blank, ask the user which PDF from `input/split-pdf/` they want to work on.)

## Phase 1: Generate Debug Output

```python
from utils.spatial_table_extractor import SpatialTableExtractor
ext = SpatialTableExtractor()
ext.render_debug('input/split-pdf/<file>.pdf', 'output/regression/debug', render_images=True)
```

After generation, list the files produced in `output/regression/debug/<pdf_stem>/`.

## Phase 2: Inspect Outputs

For each page that produced tables:
1. Read the PNG image (`P{page}.png`) and visually verify:
   - Column boundary lines don't cut through words
   - Row boundaries group data correctly
   - All tables on the page are detected (no missed tables)
   - No phantom tables or false positives
   - Headers are attached to the correct table
2. Read each CSV (`P{page}T{table}.csv`) and verify:
   - Header row makes sense (check for hierarchical headers needing `|` merge)
   - Data values match what's visible in the PNG
   - No merged or split cells that shouldn't be
   - Row counts match expectations

Present a summary of findings to the user per page/table. Flag any issues found.

## Phase 3: Fix Issues (if needed)

If extraction issues are found:
1. Diagnose the root cause in `utils/spatial_table_extractor.py`
2. Propose a fix to the user before implementing
3. After fixing, regenerate debug output and re-inspect
4. Run `python3 scripts/test_regression.py` to verify no regressions on existing PDFs

Iterate until the user is satisfied with the output quality.

## Phase 4: Promote to Expected (only when user approves)

Do NOT promote to expected baselines until the user explicitly says the outputs look good.

When approved:
```bash
mkdir -p output/regression/expected/<pdf_stem>
cp output/regression/debug/<pdf_stem>/P*T*.csv output/regression/expected/<pdf_stem>/
```

Then run `python3 scripts/test_regression.py` to confirm the new baselines pass.

Report the final count of PDFs and tables in the regression suite.
