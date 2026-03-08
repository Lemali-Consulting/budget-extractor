# Spatial Table Extractor — Remaining Issues

## Regression baseline
17 PDFs, ~100 tables in `output/regression/expected/`.

PDFs in expected: 37, 38, 39, 41, 42, 43, 44, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57

## Known imperfection in baseline
- **44 P3T1** (Stop the Violence, part-time positions): FTE and dollar-rate values are merged into single cells (e.g., `—  50.50`). This is the part-time variant of Issue 2 — the gap between FTE and rate is too narrow, and unlike grade codes (e.g., `U02-G`), dollar rates don't produce a distinct enough gap pattern for header corroboration. Locked into expected as-is; update if fixed later.

## Remaining issues (PDFs not yet in expected)

### Issue 3: Allocation table garbled (40)
**PDF:** 40_Three_Taxing_Bodies_Trust_Fund (P1T1)
**Symptom:** The allocation sub-table and footnote paragraph are forced into the 9-column position-summary structure from the preceding table, scattering text fragments across wrong columns.
**Plan:** The allocation table has a different column structure than the position summary above it. Column propagation from the header table shouldn't apply when the sub-table's x-extent or column count clearly differs. Need to investigate how propagation decides to apply and add a check.

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
