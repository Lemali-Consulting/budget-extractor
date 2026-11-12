# Section chart panel labels aren't in sentence case

**Date:** 2026-11-12
**Status:** open

The chart panel on operating section pages prints its row names as the PDF does ("Amusement Tax", "Charges for Services") and labels a tab "Year-over-Year", against Public Source's sentence-case style. Not fixed. Found while adding the tax revenue chart to the revenue summary.

## What was observed

On `/sections/revenue-summary/`, the panel's "Budget trend" legend reads "Amusement Tax", "Charges for Services", "Deed Transfer Tax", "Licenses and Permits" and so on. The new tax revenue chart directly above it reads "Amusement tax" and "Deed transfer tax", so the page now shows both styles a few inches apart.

- The tab label is hard-coded at `web/src/components/SectionCharts.tsx:70`.
- The legend uses the table's row names as printed. Reproduced table headers are sentence-cased only where they're rendered (see "House Style" in `CLAUDE.md`), and these chart labels never went through that step.

Every operating section page with a financial table shows the panel, so department pages probably have the same problem. I only checked the revenue summary.

## Related

The "Year-over-Year" tab may be removed outright: `docs/notes/2026-11-12-section-year-over-year-chart.md`. Removing it fixes that label. The legend would still need fixing.
