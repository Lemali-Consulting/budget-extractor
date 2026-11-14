# Cull the data explorer

**Date:** 2026-11-14
**Status:** accepted

## Context

Public Source's fact-check of the explorer (Rich's factcheck sheet, row 6, 2026-11-13) turned up two kinds of problem.

- **Figure mismatches.** The fact-checker's EMS and forecast numbers came from the September preliminary budget (179 pages). The site uses the Nov. 9 Mayor's budget (353 pages). Checked: the preliminary prints $728,388,498 and $39,784,973, and the Nov. 9 document prints the site's $727,326,777 and $39,385,034. These were not site errors.
- **Real defects.**
  - "View source page" shows only the first page of a two-page table. See `docs/notes/2026-11-14-source-page-shows-only-a-tables-first-page.md`.
  - Personnel trend charts dropped to zero for 2027. The explorer offered a trend chart for any table with three or more year-labelled columns. A personnel table's 2026 FTE, 2026 budget, 2027 FTE and 2027 budget were drawn as one line, so the 2027 headcount ("1") plotted as zero on a dollar scale.

Rich asked:

> "Not sure what's happening there, but wondering whether this page should just be culled." — Rich, via Max, 2026-11-13

The options put to Max:

- (a) Cull the explorer.
- (b) Keep it and fix the charts and source links.
- (c) Keep it, limited to the published pages' tables.

Max chose (a), 2026-11-14.

## Decision

- **`/explorer/` is no longer built.** The site publishes 45 pages. Old links, including shared `/explorer/#table` links, redirect home.
- **Its links are gone:** the nav's Explore menu (the menu itself now opens on Compare), the mobile nav, the home page's quick-link tile, and each section table's "Open in data explorer" link.
- **Its components are deleted:** the explorer shell and sidebar, and the trend, year-change and funding charts only it used.
- **The data stays.** The build still writes the tables index the explorer read, and the year model still loads it. Nothing else uses it yet.

## Why

The explorer was one URL that displayed every table in both budgets, including capital projects and trust funds that were cut so the site could be fact-checked (`docs/decisions/2026-11-12-pare-site-to-43-pages.md`). Department and citywide section pages already show their sections' tables with source links.
