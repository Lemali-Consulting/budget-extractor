# Department salary totals that differed from the PDF's "Net Salaries" line

**Date:** 2026-11-11
**Status:** fixed

Some department salary totals on the site didn't match the "Total Full-Time Positions and Net Salaries" line printed in their position tables. They now match for every department in 2027, 2026 and 2025, apart from one case where the PDF itself prints that label twice.

## How to check

Rebuild the data (the build steps in `deploy.sh`). For each section in `web/src/data/{prefix}budget-data.json`, read the **current-year budget column** (find it by header) on every personnel-table row whose title contains "Net Salaries", and compare with that department's `totalBudgetCurrent` in `web/src/data/views/{prefix}personnel-by-department.json`. Treat `—` as zero. Don't take "the last number on the row": for a fund with no current-year positions that is the prior-year figure, and it produced false gaps the first time this was checked.

## Causes and fixes

All of these are in how payroll rows are chosen from the position tables (`build_personnel` in `scripts/build_web_data.py`). Each is covered by `tests/test_personnel_payroll.py`.

1. **Vacancy allowance added instead of subtracted** (every department). It is printed in parentheses and now parses as negative. This was the main cause of the $291.4M headline figure Public Source flagged; commit 5d65482.
2. **Part-time pay counted twice** (most departments). The summary block repeats the itemized part-time lines as one subtotal row. That row is now skipped, but only when the department itemizes part-time lines under an empty "Temporary, Part-Time, ..." subheading. City Council labels its subtotal "Temporary, Part-Time, and Interns", which the first fix missed (+$65,997 in 2027).
3. **Part-time pay dropped** (City Clerk, 2027 and the archives). The Clerk lists part-time pay only as the summary row, with no itemized lines, so skipping that row unconditionally lost $30,575.
4. **Wrapped subtotal label counted as a position** (Mayor's Office, 2025). "Total Office of Immigrant and Refugee" / "Affairs" spans two rows, and the "Affairs" row carried the subtotal's amounts ($146,182). A "Total ..." row with no other content now causes the next row to be skipped. An audit of all three years found that only this one row matches.

## Result (2026-11-11)

- 2027: 38 of 38 departments match; citywide $281,256,190 (shown as $281.3M).
- 2026: 33 of 34; 2025: 34 of 35. The one exception each year is the City Clerk. Its PDF table (2026 p. 66) labels the full-time subtotal "Total Full-Time Positions and Net Salaries" as well as the real net line, so the check counts both. The site's figure equals the real net line.

## Correction

An earlier version of this note listed larger gaps in the archives: Environmental Services at $0, Parks Tax, PLI, OMB, Shade Tree and Stop the Violence. Those were mostly produced by the flawed check described above, not by the site.
