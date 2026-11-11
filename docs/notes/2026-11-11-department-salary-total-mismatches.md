# Department salary totals that still differ from the PDF's "Net Salaries" line

**Date:** 2026-11-11
**Status:** open

Some departments' salary totals on the site still differ from the "Total Full-Time Positions and Net Salaries" line printed in their position tables, after the vacancy-allowance fix (commit 5d65482). In 2027 the gap is under $100K and doesn't change the $281.3M headline. The 2025 and 2026 archives have larger gaps that nobody has investigated yet.

## How to check

Rebuild the data (the build steps in `deploy.sh`). Then, for each section in `web/src/data/{prefix}budget-data.json`, compare the last number on any personnel-table row whose title contains "Net Salaries" with that department's `totalBudgetCurrent` in `web/src/data/views/{prefix}personnel-by-department.json`. Differences of $1–3 are rounding.

## Gaps found on 2026-11-11

2027 (headline):
- City Council: site $3,129,024 vs PDF $3,063,027 (+$65,997)
- Office of the City Clerk: site $1,508,480 vs PDF $1,539,055 (−$30,575)

2026 archive:
- Office of the City Clerk: site $1,464,942 vs PDF $2,960,459 (about half; a position table is probably missing)
- Office of Management and Budget: +$245,590
- Stop the Violence Trust Fund: −$209,120

2025 archive:
- Bureau of Environmental Services: site $0 vs PDF $9,820,388 (no personnel rows extracted)
- Office of the City Clerk: about half missing again
- Permits, Licenses, and Inspections +$516,774; Parks Tax Trust Fund −$717,059; Office of the Mayor +$146,183; Shade Tree Trust Fund $0 vs $63,437; Stop the Violence −$1,431,451

A comparison script that skips non-numeric cells will report a false gap for Stop the Violence in 2027. The fund has no 2027 positions, so the last number on its row is the 2026 figure.

## Likely causes, not yet checked

Extraction problems in particular position tables: a table that wasn't classified as personnel, or rows split or merged across page breaks. The Clerk's roughly half-size totals point to a second table being missed.
