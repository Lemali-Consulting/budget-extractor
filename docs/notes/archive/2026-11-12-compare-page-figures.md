# The compare page labels position budgets as department budgets, and shows FTE changes

**Date:** 2026-11-12
**Status:** fixed

The restored compare page's "2027 budget" is the sum of a department's position lines, not its total budget. Its staffing cards also show the FTE change from 2026, which was removed elsewhere at Public Source's request. Both are fixed, and the page now lists departments only.

## What was observed

- **Budget figure.** On `/compare/`, Bureau of Administration (Public Safety) shows "2027 budget: $7.6M". The home page's department chart shows $21.3M for the same bureau. Bureau of Administration (Public Works) shows $2.1M against $25.8M.
  - The cards and the comparison table read `totalBudgetCurrent` / `totalBudgetPrior` from the personnel view (`web/src/components/DepartmentCompare.tsx:153`, `:194`, `:200`). That is the total of the position lines.
  - The "Budget change" row (`:206`) is computed from those same personnel figures.
  - The chips list the departments that have personnel data, trust funds included, e.g. Parks Tax Trust Fund and Grants.
- **FTE change.** Each staffing card prints the FTE change next to the headcount, e.g. "FTE: 155 (+20)". The FTE-change boxes were removed from the rest of the site in commit 58e490d. The page's intro also promises "year-over-year changes".

Found while screenshotting the restored page.

## Why it matters

A reader comparing departments would take "$7.6M" as the bureau's budget, and it doesn't match the department page or the PDF's expenditure summary. The FTE changes are the comparison Public Source asked to take off the site: functions moving between departments make them read as policy change.

## Possible fixes (considered)

- Relabel the figure "Position budget", or switch it to the department's total from the department budgets view, the one the home chart uses.
- Drop the FTE change from the cards and the "year-over-year" wording from the intro, matching 58e490d.
- Limit the chips to the 28 departments, or keep the trust funds but leave them unlinked (as now).

## Resolution

Max chose the fixes (2026-11-12):
> "1: Switched to each department's total budget 2: Drop them like the rest of the site 3: No, drop trust funds. They're not a department" — Max, 2026-11-12

- **Figures.** The page reads each department's 2027 and 2026 budget from the department budgets view, the same figure the department pages and the home chart use. The figure is now $21.3M for Bureau of Administration (Public Safety). The "Budget change" row is computed from those totals.
- **Departments.** The page offers the 28 department sections, less the Department of Public Works parent, which has no budget of its own: 27 in all (`web/src/lib/compare-departments.ts`).
- **FTE change.** The cards' FTE change and the table's "FTE change" row are gone, and so is the intro's "year-over-year changes".
- **Shared links.** A shared link (`?depts=`) used to highlight the default chips and color the change row by the default selection. The page took the selection from the link before hydration. It now applies the link after hydration.

Smoke tests cover all four.
