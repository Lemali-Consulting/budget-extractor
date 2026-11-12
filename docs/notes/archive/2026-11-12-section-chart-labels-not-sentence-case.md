# Section chart panel labels aren't in sentence case

**Date:** 2026-11-12
**Status:** fixed

The chart panel on operating section pages prints its row names as the PDF does ("Amusement Tax", "Charges for Services") and labels a tab "Year-over-Year", against Public Source's sentence-case style. Fixed on 2026-11-12, after Max said "Fix the legend casing now". Found while adding the tax revenue chart to the revenue summary.

## What was observed

On `/sections/revenue-summary/`, the panel's "Budget trend" legend reads "Amusement Tax", "Charges for Services", "Deed Transfer Tax", "Licenses and Permits" and so on. The new tax revenue chart directly above it reads "Amusement tax" and "Deed transfer tax", so the page now shows both styles a few inches apart.

- The tab label is hard-coded at `web/src/components/SectionCharts.tsx:70`.
- The legend uses the table's row names as printed. Reproduced table headers are sentence-cased only where they're rendered (see "House Style" in `CLAUDE.md`), and these chart labels never went through that step.

Every operating section page with a financial table shows the panel. Department pages had the same problem: their account rows were printed as labels.

## Related

The "Year-over-Year" tab may be removed outright: `docs/notes/2026-11-12-section-year-over-year-chart.md`. That note is still open.

## Resolution

- **Category rows** are now sentence-cased in the panel's legend, axis labels and breakdown ("Charges for services"). The name after an account code is capitalized ("51101 - Regular").
- **Department and fund names** stay as printed. When at least half of a table's rows match a department or fund title, the whole table is treated as a list of names. The PDF prints some names short ("Public Safety Administration"), and no casing rule could tell those apart from categories.
- **The tab** is now "Year-over-year".

The rule lives in `web/src/lib/chart-labels.ts`. Three smoke tests cover it: categories in house style on the revenue summary, department names kept on the expenditure summary, and account rows on the police page.
