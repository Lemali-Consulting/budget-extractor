# Regression Testing

## Running Tests

```bash
python3 scripts/test_regression.py
```

This regenerates debug CSVs in `debug/` and compares them against `expected/`.

## Adding a New Regression Baseline

1. Generate debug output with images:
   ```python
   from utils.spatial_table_extractor import SpatialTableExtractor
   ext = SpatialTableExtractor()
   ext.render_debug('input/split-pdf/<file>.pdf', 'output/regression/debug', render_images=True)
   ```

2. Visually inspect the PNG images in `debug/<pdf_stem>/P{page}.png`:
   - Verify column boundary lines don't cut through words
   - Check that row boundaries group data correctly
   - Confirm all tables on the page are detected (no missed tables)
   - Look for phantom tables or false positives
   - Ensure headers are attached to the correct table

3. Review the CSV files in `debug/<pdf_stem>/P{page}T{table}.csv` for data accuracy.

4. Copy verified CSVs to `expected/`:
   ```bash
   cp -r output/regression/debug/<pdf_stem> output/regression/expected/
   rm output/regression/expected/<pdf_stem>/debug.pdf output/regression/expected/<pdf_stem>/*.png
   ```

5. Re-run `python3 scripts/test_regression.py` to confirm all tests pass.

## Directory Structure

- `expected/` — Ground-truth CSVs. Compared against during test runs.
- `debug/` — Regenerated each test run (CSVs only). Use `render_images=True` for PNGs.
