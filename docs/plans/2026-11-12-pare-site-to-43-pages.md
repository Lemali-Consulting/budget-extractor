# Pare the public site to 43 pages

**Date:** 2026-11-12
**Status:** completed

## Goal

Rich and Public Source want the site to have 50 or fewer pages, so it can be edited and fact-checked thoroughly. This plan cuts it from 196 pages to 43. Each department gets one merged page, and the cuts Max approved are made.

## Current State (before this plan)

The 196 built pages are:
- 68 capital project pages;
- 63 operating section pages, each reproducing one PDF section;
- 46 department summary pages;
- 5 embed pages;
- 14 other pages.

Each department has two pages: a summary (`/departments/{slug}/`) and its PDF section (`/sections/{slug}/`). Links into cut pages come from:
- the nav;
- home page tiles and charts;
- the operating, capital and trust fund indexes;
- the personnel explorer, staffing chart and pay-split notes;
- glossary backlinks;
- the money-flow page;
- each table's "open in explorer" link.

The full PDF isn't hosted; only its page images are.

## Decisions (Max, 2026-11-12)

- **Department pages:** one merged page per department, with the summary on top and the PDF section below. Max chose a merged page over keeping only the summary or only the section page.
- **Which departments:** all 28 department-level sections (PDF sections 9–36), counting the Department of Public Works parent section and the two boards. Rich counted 29; this list has 28.
- **Citywide sections:** undecided.
  > "Unsure. Let's do the other cuts/consolidaitons and see where we land after this." — Max
  The five proposed are kept for now: Five-Year Forecast, Revenue Summary, Revenue Detail, Expenditure Summary and Expenditures Detail (sections 3, 4, 6, 7, 8).
- **Embeds:** cut all 5 embed pages.
- **Rich's cuts:** the capital project pages and the trust fund pages.
- **The other cuts from the proposal:**
  - the data explorer, compare page and /hero/;
  - the departments index, whose job the operating index does;
  - the PDF sections with no tables (1, 2, 5, 59, 62);
  - the heavy reference sections (57, 58, 60, 61, 63).

## Pages kept (43)

- **10 single pages:** home, operating, capital, about, trust funds overview, brief, trends, glossary, personnel, money flow.
- **28 department pages** at `/departments/{slug}/`.
- **5 citywide section pages** at `/sections/{slug}/`.

## Proposed Approach

1. **Published pages.** Write one list of what's published, by section number range: departments, citywide sections. Add one function that gives a section's page link: `/departments/` for a department, `/sections/` for a kept citywide section, or none when the section isn't published. Every link site uses it.
2. **Merged department page.** Move the summary's body (narrative, hero stats, trend, top expenditures, top positions) into a component without the page frame. Render the section page at `/departments/{slug}/` with that summary in place of its summary card. The Department of Public Works gets a page for the first time. Prev/next steps through published pages only.
3. **Remove routes:**
   - capital project pages, explorer, compare, hero, embed pages and the departments index;
   - headline section pages except the 5 citywide;
   - department pages except the 28.
   Keep the archive's components, which the dormant `[year]` routes still import. Delete components only removed pages used.
4. **Repoint links:**
   - nav "Departments" → operating index departments group; drop Explore items for the cut pages;
   - home tiles;
   - operating index regrouped: departments → department pages, trust funds → overview, cut sections not listed;
   - capital index project names become plain text;
   - trust fund names on the overview become plain text;
   - personnel explorer, staffing chart, pay-split notes, the home department chart, money flow and glossary backlinks go through the link function, and become plain text when the target isn't published;
   - the Brief drops its embed buttons;
   - section tables drop "open in explorer".
5. **Redirects** (`web/public/_redirects`):
   - `/sections/{department}/` → `/departments/{department}/` (28 rules);
   - trust fund sections and department pages → `/trust-funds/`;
   - other `/sections/*` → `/operating/`;
   - `/capital/*` → `/capital/`;
   - `/departments/` → `/operating/#departments`;
   - explorer, compare, hero and `/embed/*` → `/`.
   Kept pages shadow the catch-alls, because Netlify serves an existing file before applying a non-forced rule.
6. **Tests:** each step's test goes in first, as failing smoke tests:
   - the built page list is exactly the 43;
   - no kept page links to an unpublished one;
   - a merged department page shows both the summary and the PDF tables;
   - every department slug has its `/sections/` redirect.
   Then rewrite existing tests that visit cut pages.
7. **Docs:** decision record, CLAUDE.md (project intro, smoke test coverage, search), and update this plan's status.

## Files Affected

- `web/src/lib/` — new published-pages module.
- `web/src/lib/static-paths.ts` — headline paths filtered to published pages.
- `web/src/components/pages/DepartmentPage.astro`, `SectionPage.astro` — summary extracted and merged.
- `web/src/pages/` — routes removed.
- `web/src/layouts/Base.astro`, `pages/index.astro`, `brief.astro`, `glossary.astro`, `flow.astro`, `about.astro` — links.
- `web/src/components/pages/OperatingIndexPage.astro`, `CapitalIndexPage.astro`, `TrustFundsPage.astro`, `PersonnelPage.astro` — links.
- `web/src/components/PersonnelExplorer.tsx`, `PersonnelTreemap.tsx`, `FundSplitNote.tsx`, `BudgetChart.tsx` — links.
- `web/public/_redirects`, `web/tests/*.spec.ts`, `CLAUDE.md`, `docs/decisions/`.

## Open Questions

- Which citywide sections stay. This is deferred until the count is in.
- Whether to stop publishing the page images of cut sections and capital projects. They're image files, not pages, and remain reachable only by direct URL.

## Risks

- **Silent dead links.** A link built from a template string is easy to miss. The no-unpublished-links smoke test crawls every kept page's anchors against the built page list.
- **Archive routes.** The `[year]` routes still compile while unpublished. Keeping their components avoids breaking the build.
