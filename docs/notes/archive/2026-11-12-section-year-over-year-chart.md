# Section pages chart a year-over-year change we calculate

**Date:** 2026-11-12
**Status:** fixed

Each operating section page had a "Year-over-Year" chart tab that plotted our own subtraction of the PDF's year columns, row by row. It also rendered badly: labels were misplaced, and it was unreadable on phones. Max had it removed on 2026-11-12; see `docs/decisions/2026-11-12-remove-section-year-over-year-chart.md`.

## What was observed

The section charts panel (`web/src/components/SectionCharts.tsx:59`, tab added at `:70`) picks the section's financial summary table, falling back to its first financial table. It finds every column whose header contains a year. When there are at least two, it offers a "Year-over-Year" tab that charts the difference between those columns for each row. The PDF doesn't print those differences per row. It prints a total change column only on the summary line.

Found while sweeping the preview for leftover FTE-change wording after the FTE-change boxes were removed (commit 58e490d). The tab button's "Year-over-Year" label matched the sweep on `/sections/office-of-community-health-and-safety/`.

## How it renders (checked 2026-11-12)

Found while fixing the panel's clipped value labels:
- **Labels are misplaced at every width.** The percentage printed for each bar sits about half a row off, between that bar and the next. On `/sections/expenditure-summary/`, "+227.3%" sits beside the Bureau of Fire's bar, not the Office of Community Health and Safety's.
- **The axis format is wrong.** The x axis prints negative amounts as "$-35.0M".
- **It's unreadable on phones.** At 375px, department names take most of the width, and the labels pile on top of each other.

Removing the tab fixes all three. If it stays, these need fixing first.

## Why it matters

The FTE-change removal was about staffing, so this dollar chart was left in place. But the client has repeatedly cut comparisons the site computes rather than reproduces:
- the "What changed" page;
- the budget increase and decrease embeds;
- the Brief's staffing comparison;
- the position-change lists;
- the FTE-change boxes.

This tab is the same kind of thing.

> "Note that as something we should look into before shipping to production." — Max, 2026-11-12, replying to the side observation that the tab charts a computed dollar change.

## Options

- Remove the tab, leaving "Budget trend" and "Breakdown". Those plot the PDF's own figures.
- Keep it, and label it as our calculation.
- Keep it as is.

## Resolution

Max chose to remove the tab (2026-11-12): "Remove the year-over-year tab". The panel now offers only "Budget trend" and "Breakdown", and a smoke test checks for exactly those two tabs. Recorded in `docs/decisions/2026-11-12-remove-section-year-over-year-chart.md`.
