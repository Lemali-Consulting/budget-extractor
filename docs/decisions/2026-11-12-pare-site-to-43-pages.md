# Pare the public site to 43 pages (now 46)

**Date:** 2026-11-12
**Status:** accepted

## Context

The site built 196 pages. Rich (Public Source) asked for 50 or fewer, so that each page can be edited and fact-checked:

> "We want to pare the publicly available part of Pittsburgh Budget Explorer down to 50 pages or fewer, largely to make it possible for us to be thorough in the processes (editing and fact-checking) that are core to Public Source's value proposition." — Rich, via Max, 2026-11-12

Rich named the keepers: the big-picture page, the operating and capital summaries, and every department and bureau. He also named the cuts: the capital project pages and the trust fund pages. The plan is in `docs/plans/2026-11-12-pare-site-to-43-pages.md`.

Each department had two pages, a summary and its PDF section. Max made these choices from the options laid out:

> "1: Let's try the merged page approach 2: Let's count the Department of Public Works parent section and the two boards 3: Unsure. Let's do the other cuts/consolidaitons and see where we land after this. 4: Cut them" — Max, 2026-11-12

The four answers cover:
1. merged page, over keeping only the summary or only the section;
2. which sections count as departments;
3. which citywide sections stay;
4. the embed pages.

## Decision

**Update (2026-11-12):** Max brought back the data explorer and then the compare page ("Actually, let's bring the Data Explorer page back", "Also let's bring back the /compare page"). That makes **45 pages**: 12 single pages. Their links to sections go through the published-pages module, like everything else: capital tables and unpublished sections aren't linked. Section tables again carry "Open in Explorer". The compare page now shows each department's total budget, departments only, and no FTE change. See `docs/notes/archive/2026-11-12-compare-page-figures.md`.

**Update (2026-11-14):** The data explorer was culled after Public Source's fact-check, making **45 pages**. See `docs/decisions/2026-11-14-cull-the-data-explorer.md`.

**Update (2026-11-12):** Max brought back the Grants section (58) as a citywide section page ("Bring back the Grants section as a page"), making **46 pages**. It had been cut with the reference sections, but it is the only place the budget lists each grant, with its funder, purpose, and amounts awarded, spent and remaining. Max asked after it was pointed out that grants otherwise appeared only as revenue and expense line items and in the data explorer.

The first cut published 43 pages:
- **10 single pages:** home, operating, capital, about, trust fund overview, brief, trends, glossary, personnel, money flow.
- **28 department pages** at `/departments/{slug}/`, one for each of PDF sections 9–36. Each shows the department summary on top: headline figures, trend, top expenditures and top positions. The PDF section's tables follow. The Department of Public Works parent section gets a page for the first time. Rich counted 29 departments; the document has 28 department-level sections.
- **5 citywide sections** at `/sections/{slug}/`: Five-Year Forecast, Revenue Summary, Revenue Detail, Expenditure Summary and Expenditures Detail. This set is provisional, per answer 3.

Cut:
- the 68 capital project pages;
- the 20 trust fund pages;
- the reference and no-table sections (1, 2, 5, 57–63); Grants (58) was later restored (see the updates above);
- /hero/, the departments index and the 5 embed pages. The data explorer and compare page were cut too, then restored (see the update above).

Links work as follows:
- One module decides what is published and gives every link its target: `web/src/lib/published-pages.ts`.
- A name with no published page shows as plain text. This covers capital project cards, trust fund names, pay-split funds that are trust funds, glossary "used in" chips for cut sections, and the "CBA rates" note.
- The nav's Departments item points to the departments group on the operating index.
- The operating index lists the trust funds as one card for the overview.
- Old URLs redirect in `web/public/_redirects`:
  - a department's `/sections/` URL goes to its department page;
  - trust funds go to the overview;
  - other sections go to the operating index;
  - capital projects go to the capital index;
  - the explorer, compare, hero and embeds go home.

A smoke test lists the 43 pages and fails on any page built beyond them. It also crawls each one for links to anything else.

## Consequences

- **Page images stay published.** The cut sections' and capital projects' page images still ship and can be reached by direct URL. They are image files, not pages. Whether to stop publishing them is open.
- **Search covers less.** Search no longer finds text that appeared only on capital project or cut section pages.
- **Archive years are unaffected.** When published, they keep every section and capital page. The components those routes use stay in the repo.
