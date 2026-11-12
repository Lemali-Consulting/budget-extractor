# Section pages chart a year-over-year change we calculate

**Date:** 2026-11-12
**Status:** open, to review before shipping to production

Each operating section page has a "Year-over-Year" chart tab that plots our own subtraction of the PDF's year columns, row by row. It is still live on the preview, and nobody has decided whether it stays.

## What was observed

The section charts panel (`web/src/components/SectionCharts.tsx:59`, tab added at `:70`) picks the section's financial summary table, falling back to its first financial table. It finds every column whose header contains a year. When there are at least two, it offers a "Year-over-Year" tab that charts the difference between those columns for each row. The PDF doesn't print those differences per row. It prints a total change column only on the summary line.

Found while sweeping the preview for leftover FTE-change wording after the FTE-change boxes were removed (commit 58e490d). The tab button's "Year-over-Year" label matched the sweep on `/sections/office-of-community-health-and-safety/`.

## Why it matters

The FTE-change removal was about staffing, so this dollar chart was left in place. But the client has repeatedly cut comparisons the site computes rather than reproduces:
- the "What changed" page;
- the budget increase and decrease embeds;
- the Brief's staffing comparison;
- the position-change lists;
- the FTE-change boxes.

This tab is the same kind of thing.

> "Note that as something we should look into before shipping to production." — Max, 2026-11-12, replying to the side observation that the tab charts a computed dollar change.

## Options (none chosen)

- Remove the tab, leaving "Budget trend" and "Breakdown". Those plot the PDF's own figures.
- Keep it, and label it as our calculation.
- Keep it as is.
