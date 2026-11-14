# The department budget trend chart doesn't highlight the budget year

**Date:** 2026-11-14
**Status:** fixed (2026-11-14)

On every department page, all bars in the "Budget trend" chart were the same light blue, though the chart is meant to draw the budget year's bar in the primary color. Fixed 2026-11-14 with the row 42 changes to the same chart.

## Evidence

- `web/src/components/TrendMini.tsx` takes a required `highlightYear` and colors the bar whose label includes it.
- `web/src/components/DepartmentSummary.astro` renders `<TrendMini data={…} client:load />` without `highlightYear`, so the check compares against the string "undefined", which matches nothing.
- Seen on `/departments/bureau-of-fire/` in the local build of 2026-11-14.

## Fix

Pass `highlightYear={budgetYear.year}`. Row 42 (group 6, the Office of Community Health and Safety's near-zero 2026 spending) also changes this chart, so the two could be done together.

## Resolution

Fixed 2026-11-14 alongside row 42 (group 6): `DepartmentSummary.astro` now passes `highlightYear={budgetYear.year}`. `web/tests/budget-trend.spec.ts` checks that exactly one bar on the Bureau of Fire's chart is in the primary color.
