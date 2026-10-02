# Long-run view of Pittsburgh's headline budget figures

**Date:** 2026-10-01
**Status:** in-progress (built on `feat/2027-proposed`; merge and deploy await the user)

## Goal

Add a trends view showing Pittsburgh's revenue, spending, reserves and major taxes over time. Each figure is labelled as actual, estimate, budget or forecast, and the headline (2027 proposed) budget is set against that history.

## Current State

- Each operating budget document reports more than its own year:
  - prior-year actuals and the current-year budget;
  - a Five-Year Financial Forecast covering revenues, expenditures, use of fund balance and the ending reserve balance;
  - in the 2025 and 2026 documents, a five-year history of actual revenues by tax.
- We hold baselines for 2025, 2026 and 2027-proposed. The 2024 PDFs are in `input/2024/` with section definitions, but were never extracted.
- Figures checked by hand on 2026-10-01 from the existing baselines:
  - Revenue actuals: 2020 $551.6M, 2021 $593.6M, 2022 $658.8M, 2023 $697.6M, 2024 $703.6M.
  - The 2027 proposal has $701.8M of recurring revenue plus $26.6M from reserves. Its forecast projects the reserve balance falling to −$38.2M by 2031.
  - 2025 actual revenue is in none of our documents. The 2027 document has no revenue-history table.
- The 2027 Revenue Detail "Total Revenue" row used to have all five years merged into one cell. Fixed in step 1.

## Proposed Approach

Sequenced after the 2027 headline switch (Phase 3 of `2026-10-01-2027-proposed-budget-headline.md`), on the same branch.

1. **Fix the 2027 Revenue Detail total-row merge**, test-first, and re-baseline that table.
2. **Extract the 2024 headline sections only**: Five-Year Financial Forecast, Revenue Summary and Expenditure Summary. Baseline them after the user reviews them, like 2027.
3. **Build a longitudinal dataset** with a new script, `scripts/build_longitudinal.py`. It writes `web/src/data/views/longitudinal.json`.
   - It reads the headline tables from every year's baselines.
   - Each record carries `{metric, fiscalYear, value, kind: actual|estimate|budget|forecast, sourceYear, sourceVariant, sourcePage}`.
   - Metrics: total revenues, recurring revenue (excluding use of fund balance), total expenditures, use of fund balance, ending reserve balance, and revenue by major tax.
   - Where several documents report the same actual, the most recent document wins and earlier values are kept as restatements.
   - Tests cover parsing each year's table layout, plus reconciliation against the hand-checked figures above.
4. **Add a `/trends/` page.** It charts each metric with Observable Plot, the site's existing chart library:
   - one series of actuals;
   - each document's budget-and-forecast as its own line ("vintage"), so forecast drift is visible;
   - the headline proposal highlighted, with callouts comparing it with history (e.g. recurring revenue vs the 2024 actual; reserve trajectory).
   - Link it from the nav and the home page.
5. **Wire it into `deploy.sh`** and add smoke tests.
6. **Optional later step:** extend the history with older documents' summary and forecast pages (2019–2023), downloaded from the City of Pittsburgh's budget page. Only with the user's go-ahead on which years.

## Files Affected

- `utils/spatial_table_extractor.py`, plus a new test: the Revenue Detail total-row fix
- `input/2024/split-pdf/` (gitignored), `output/regression/expected/2024/operating/{forecast, revenue summary, expenditure summary}/`
- `scripts/build_longitudinal.py` (new), `tests/test_build_longitudinal.py` (new)
- `web/src/pages/trends.astro` and chart components (new); nav in `web/src/layouts/Base.astro`; `web/tests/smoke.spec.ts`
- `deploy.sh`

## Open Questions

- Where should 2025 actual revenue come from? Options: wait for the 2028 document, or take it from the City's Annual Comprehensive Financial Report (a different accounting basis, so it would need labelling).
- Which older years, if any, to add beyond 2024 (step 6)?
- The 2027 document gives two different 2026 expenditure estimates ($741.1M on the forecast page, $728.6M in the forecast detail). Which one should be shown, or should both be noted?

## Risks

- Documents restate prior years and change table layouts. Mitigation: per-document parsers with tests, and visible restatement notes.
- Readers may mistake forecasts for commitments. Mitigation: every point is labelled by kind and source document; forecasts are styled differently from actuals.

## Progress

- **Step 1 (done, 2026-10-01):** rule-split total rows now rejoin their table's columns, guarded so labels left of the first column are never dropped. Re-baselined: 2027 Revenue Detail, plus the same improvement in Expenditure Summary (2025, 2026 both variants), 2025 Parks Tax Trust Fund and PLI personnel (2026 amended, 2027).
- **Step 2 (done, 2026-10-01):** the 2024 headline sections are baselined (the user approved them). the 2024 split PDFs are regenerated, and the three headline sections were extracted to scratch (not yet baselined).
  - Every table number appears in the PDF; no cell holds two numbers.
  - The tables the dataset needs are clean: forecast summary and department totals; revenue forecast totals; the 2020–2024 revenue history; spending by subclass.
  - The rest are chart-label fragments and a garbled "Annual Growth Rate" strip. The same layout exists in 2025–2026 and is unused.
  - Restatement seen: 2023 actual revenue is $688.1M in the 2024 document but $697.6M in the 2025/2026 history tables.
- **Step 3 (done):** `scripts/build_longitudinal.py` reads the forecast summary table (all years), the forecast department table (actual totals only) and the revenue-history table. Where the 2027 document's two tables disagree on the 2026 expenditure estimate, the summary table drives the line and the department table's figure is kept as a conflict, drawn as a hollow diamond with a note (the user chose to show both). There are two conflicts: 2027 doc 2026 estimate, $741.1M vs $728.6M; 2025 doc 2024 estimate, $682.0M vs $684.8M. Restatements ignore sub-dollar rounding.
- **Step 4 (done):** the `/trends` page charts revenue, expenditures and reserve balance across the 2024–2027 documents; `deploy.sh` runs the builder.

