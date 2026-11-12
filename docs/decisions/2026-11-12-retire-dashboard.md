# Retire the dashboard page

**Date:** 2026-11-12
**Status:** accepted

## Context

The headline site had a `/dashboard/` page: summary stat cards, the department budget chart, the revenue waterfall, capital funding sources and the staffing treemap. Every one of those already appears elsewhere. The home page has the stat cards and the department chart, the personnel page has the staffing chart, the Brief has the revenue breakdown and the capital index has the funding sources. Max judged the page "redundant with the home page" (2026-11-12, "let's cut the /dashboards page").

## Decision

- Delete the page. Links to it are retargeted or removed:
  - the home page's "Where does the money come from?" chip now goes to the money-flow page (`/flow/`);
  - the home page's "Full dashboard" link is removed;
  - the home page's Dashboard tile becomes a Money flow tile;
  - the Brief's "Explore the full dashboard" link becomes a money-flow link;
  - the Explore menu drops the Dashboard item, and the menu heading itself now links to the explorer.
- Netlify sends old `/dashboard/` links to the home page with a permanent redirect (`web/public/_redirects`). Links already shared, such as in the fact-check sheet, keep working. This was our call, not Max's.
- The personnel card's detailed form appeared only on the dashboard, and it is removed: the overtime note, year-over-year change, page citation and General Fund FTE count. The card now has only the compact form the home page uses. The FTE sum went with it, since nothing else used it.

## Consequences

- The site no longer shows the General Fund FTE count (3,299 in the 2027 proposed budget) or a page citation for the $328.2M salaries line. The personnel page still explains how the $328.2M line relates to the department totals.
- Smoke tests that ran against the dashboard now run on the pages that still carry each chart. New tests check that `/dashboard/` is not built and that no main page links to it.
