# Post-Extraction Data Validation

**Date:** 2026-03-15
**Status:** draft

## Goal

Create a validation script that runs after extraction and before baselining, surfacing data anomalies early — when they can still be fixed — rather than at deploy time.

## Current State

- `batch_validate.py` runs structural checks on raw CSVs (merged cells, column counts, page number leaks, sparse rows) but misses header/data column mismatches and has no cross-year or statistical checks
- Data issues are discovered ad hoc during visual inspection or when the cross-year comparison looks wrong
- The `/add-regression-pdf` command promotes debug output to expected without validation

## Proposed Approach

A single `scripts/validate_data.py` with three passes, run at different points in the workflow:

### Pass 1: Structural (runs on raw CSVs after extraction)

Checks each CSV in `output/regression/debug/{year}/`:

- **Header/data column mismatch**: header row has more columns than coord row (caught Fire, Liquid Fuels today)
- **Year header sanity**: for a 2025 budget doc, financial tables should have "2025" in at least one header — flag tables where the year headers don't match the document year (would have caught Environmental Services)
- **Total row quality**: financial tables should have an "Expenditures Total" row with parseable amounts in budget columns — flag tables where the only total rows have all dashes
- Incorporate existing `batch_validate.py` checks (merged cells, column counts, page numbers, sparse rows)

Usage: `python3 scripts/validate_data.py structural --year 2025`

### Pass 2: Cross-year consistency (runs after `build_web_data.py` for both years)

Reads the built JSON files and compares overlapping columns:

- **Budget column match**: "2025 Budget" in the 2025 doc should equal "2025 Budget" in the 2026 doc for each department. Flag mismatches above $10 (rounding threshold)
- **Magnitude check**: no department's budget should differ by >5x between the two documents' overlapping columns
- **Completeness**: every department in year N should appear in year N+1 (or be flagged as new/removed)
- **FTE consistency**: same as budget match but for FTE columns

Usage: `python3 scripts/validate_data.py cross-year --years 2025,2026`

### Pass 3: Statistical outliers (runs on built JSON for a single year)

- **Tiny budget**: flag departments where budget is <1% of the median department budget (suggests picking up a subtotal)
- **Huge swing**: flag >50% year-over-year change within a single document's columns (may be legitimate but worth reviewing)
- **Missing data**: sections in sections.json that produce zero financial rows

Usage: `python3 scripts/validate_data.py outliers --year 2025`

### Output format

Plain text report with severity levels:

```
ERROR   STRUCTURAL  27_Bureau_of_Fire/P5T0  header has 8 cols, data has 7
ERROR   CROSS-YEAR  Bureau of Fire          2025 Budget: $2.1M (2025 doc) vs $99.0M (2026 doc) — 45x
WARN    OUTLIER     Liquid Fuels Trust Fund 2025 Budget $81K is <1% of median ($6.4M)
INFO    MISSING     Environmental Services  no "2025 Budget" column in 2025 doc
```

Exit code 1 if any ERRORs, 0 otherwise — so it can gate baselining.

### Integration with workflow

Update `/add-regression-pdf` command to run Pass 1 after extraction and before prompting to promote. The command should show warnings and require acknowledgment before baselining.

## Files Affected

- `scripts/validate_data.py` — new, all three passes
- `scripts/batch_validate.py` — can be deprecated or have its checks folded into validate_data.py
- `.claude/commands/add-regression-pdf.md` — add validation step between extract and promote

## Open Questions

- Should Pass 1 run automatically in `test_regression.py` as well, or keep it separate?
- Should we maintain a `known_issues.json` so flagged-but-accepted anomalies don't re-alert every run?

## Risks

- False positives could make the report noisy and get ignored. Mitigation: keep thresholds conservative, use severity levels, support a known-issues suppress list.
