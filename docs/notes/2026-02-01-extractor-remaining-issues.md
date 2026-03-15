# Spatial Table Extractor — Remaining Issues

## Regression baseline
19 PDFs in `output/regression/expected/`.

PDFs in expected: 37, 38, 39, 40, 41, 42, 43, 44, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58

## Known imperfection in baseline
- **44 P3T1** (Stop the Violence, part-time positions): FTE and dollar-rate values are merged into single cells (e.g., `—  50.50`). This is the part-time variant of Issue 2 — the gap between FTE and rate is too narrow, and unlike grade codes (e.g., `U02-G`), dollar rates don't produce a distinct enough gap pattern for header corroboration. Locked into expected as-is; update if fixed later.

## Remaining issues (PDFs not yet in expected)

### Issue 4: Net Total row misaligned (45)
**PDF:** 45_Liquid_Fuels_Trust_Fund (P0T1)
**Symptom:** An extra empty column appears in the table structure, pushing the "Net Total" label into C1 instead of C0.
**Plan:** Investigate why an extra column is detected. Likely a gap anomaly in one or two rows creating a spurious column that passes the frequency filter.

### Issue 5: Hours + Budget concatenated (46)
**PDF:** 46_Regional_Asset_District_-_Public_Works_Trust_Fund (P2T0)
**Symptom:** The Laborer row has Hours/Months and Budget values merged into one cell (`149,760  3,664,627`).
**Plan:** Similar to Issue 2 — the gap between Hours and Budget for this specific row is too narrow. May be a one-off data anomaly (large hour count pushing into the Budget column's space). Check if header separators could help here.

### Issue 6: Page number leaked into table (49)
**PDF:** 49_Parks_Tax_Trust_Fund (P2T1)
**Symptom:** The page number "278" appears as a stray row at the end of the part-time allowances table.
**Plan:** Page numbers should be filtered by `_filter_page_headers`. This one likely survives because it sits close to (or within) the table's y-extent rather than being isolated at the bottom of the page. Consider filtering single-number rows that match typical page number patterns.

## Resolved issues
- **Issue 1** (beginning balance in header): Fixed by recognizing comma+decimal numbers and em-dashes as data cells in `_is_header_table`, preventing balance rows from being misclassified as headers.
- **Issue 2** (FTE + Rate/Grade merged): Fixed by collecting sub-threshold gaps for header separator corroboration and tightening the duplicate-separator proximity check. Full-time position tables now correctly split; part-time tables with dollar rates remain affected (see known imperfection above).
- **Issue 3** (allocation table garbled): Fixed with two changes: (a) column propagation now checks that the headerless table's natural column count is ≥50% of the propagated count, preventing different-structure tables from inheriting the wrong schema; (b) trailing prose/footnote rows are filtered before column detection via `_filter_prose_rows`, which strips long wide tokens (>50% region width, >50 chars) from the bottom of sub-table regions, preventing footnote text from distorting column boundaries.
