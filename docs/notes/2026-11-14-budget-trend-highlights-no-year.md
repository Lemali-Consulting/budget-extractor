# The department budget trend chart doesn't highlight the budget year

**Date:** 2026-11-14
**Status:** open

On every department page, all bars in the "Budget trend" chart are the same light blue. The chart is meant to draw the budget year's bar in the primary color. The fact-check didn't flag it. It is recorded here and not fixed.

## Evidence

- `web/src/components/TrendMini.tsx` takes a required `highlightYear` and colors the bar whose label includes it.
- `web/src/components/DepartmentSummary.astro` renders `<TrendMini data={…} client:load />` without `highlightYear`, so the check compares against the string "undefined", which matches nothing.
- Seen on `/departments/bureau-of-fire/` in the local build of 2026-11-14.

## Fix

Pass `highlightYear={budgetYear.year}`. Row 42 (group 6, the Office of Community Health and Safety's near-zero 2026 spending) also changes this chart, so the two could be done together.
