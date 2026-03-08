Ground-truth CSV files used by `scripts/test_regression.py` to catch regressions in the spatial table extractor.

Each subdirectory corresponds to a PDF from `input/split-pdf-revised/` and contains per-page, per-table CSV files (`P{page}T{table}.csv`). These files are copied from `output/regression/debug/` after manual verification. Any change to the extractor that alters output for these PDFs will cause the regression test to fail.
