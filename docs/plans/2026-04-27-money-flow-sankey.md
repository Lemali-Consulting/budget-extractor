# Money Flow Sankey Visualization

**Date:** 2026-04-27
**Status:** completed

## Decisions Locked

- **Scope**: ship operating + capital Sankeys together in v1.
- **Page name**: "Money Flow" (path `/flow/`).
- **Department cutoff**: <1% of total grouped into "Other departments".
- **Teaser**: server-rendered static SVG on the home page (no hydration).
- **Year**: pinned to 2026 in v1; multi-year toggle deferred.

## Goal

Add a visually arresting "money flow" Sankey diagram as a new top-level page (`/flow/`) that traces revenue categories → total budget → departments, with a smaller teaser embedded on the home page that links to it.

## Current State

- Home page (`web/src/pages/index.astro`) is a card-and-stat landing page over `department-budgets.json`, `revenue-waterfall.json`, `capital-funding-sources.json`, and `personnel-by-department.json`.
- Charts use Observable Plot (`@observablehq/plot`) and a few custom Preact components in `web/src/components/`. d3-scale, d3-force, and d3-ease are already dependencies.
- No Sankey-style flow visualization exists. Plot does not ship a Sankey mark — d3-sankey is the standard option.
- Nav lives in `web/src/layouts/Base.astro` and `Story.astro`, grouped into Budgets / Explore dropdowns.
- Smoke tests in `web/tests/smoke.spec.ts` enumerate routes and check titles + key content.

## Proposed Approach

1. **Library choice** — add `d3-sankey` (+ `@types/d3-sankey`) as a dependency. Render via Preact island, output inline SVG. Stay with existing d3 ecosystem rather than pulling in a heavier viz framework.

2. **Operating Sankey (primary)** — two-stage flow:
   - Left nodes: 7 revenue categories from `revenue-waterfall.json`.
   - Middle node: "2026 Operating Budget" (sum).
   - Right nodes: departments from `department-budgets.json` filtered to `year === "2026 Budget"`.
   - Group small departments (< ~1% of total) into an "Other departments" node to keep labels readable; expand on click.
   - Links sized by amount; node ordering by descending amount on each side.

3. **Capital Sankey (secondary, same page below)** — three-stage flow from `capital-funding-sources.json`:
   - Funding source → top-N projects (group tail into "Other projects") → year (2026–2031).
   - Toggle to swap middle/right axes (project-centric vs year-centric).

4. **Data shaping** — do the node/link transformation at build time inside the `.astro` frontmatter (same pattern as `index.astro`) and pass a plain `{nodes, links}` object to the Preact island. No new build script needed.

5. **Layout & responsiveness** — full-bleed within site container, min-height ~640px on desktop. On narrow screens (<768px), rotate to vertical orientation or fall back to a stacked summary chart with a "view on desktop for full diagram" note. Use `ResizeObserver` to re-run sankey layout on resize.

6. **Interactions**
   - Hover a node or link: dim non-connected paths to ~15% opacity, show tooltip with `$X.XM` and share-of-total %.
   - Click a department node: deep-link to its existing operating detail page.
   - Click a revenue node: scroll to / highlight a small explanatory blurb (data already available in waterfall labels).
   - Optional: a "trace a dollar" affordance — click a revenue node, animate a particle along its outgoing links.

7. **Color scheme** — pull from existing Tailwind palette already used in `BudgetChart.tsx` / `WaterfallChart.tsx` (blues for revenue, greens for inflows, neutral grays for the trunk, categorical for departments). Audit existing components for the exact tokens before picking.

8. **Teaser on home page** — a smaller, non-interactive Sankey (~280px tall) above the existing hero stats, with a "See the full money flow →" CTA linking to `/flow/`. Render server-side via the same island in a "static" mode (no hover, fewer labels).

9. **Navigation** — add `/flow/` to the Budgets dropdown in both `Base.astro` and `Story.astro` (e.g., between "What Changed" and "Cross-Year"). Decide label: "Money Flow" or "Where It Goes".

10. **Smoke tests** — add `/flow/` to `web/tests/smoke.spec.ts`: assert title, presence of an SVG with sankey paths, and absence of console errors.

11. **Embed support (optional, follow-up)** — mirror the pattern in `web/src/pages/embed/` if we want a shareable iframe version. Out of scope for v1.

## Files Affected

- `web/package.json` — add `d3-sankey` + `@types/d3-sankey`
- `web/src/components/FlowSankey.tsx` *(new)* — Preact island, takes `{nodes, links, mode}`
- `web/src/pages/flow.astro` *(new)* — page wrapper, builds operating + capital flow data
- `web/src/pages/index.astro` — insert teaser embed + CTA
- `web/src/layouts/Base.astro` — add nav entry
- `web/src/layouts/Story.astro` — add nav entry (mirror)
- `web/tests/smoke.spec.ts` — add `/flow/` route assertions
- `web/src/components/README.md` — note the new component

## Open Questions

- **Naming:** "Money Flow", "Where It Goes", or "Budget Flow"? Affects nav and page title.
- **Departments cutoff:** 1% threshold or fixed top-15 + Other? Trade-off: clarity vs hiding mid-size departments.
- **Capital diagram:** ship in v1 alongside operating, or land operating first and add capital in a follow-up?
- **Teaser interactivity:** truly static (server-rendered SVG) or live but de-tuned? Static is faster to load and avoids hydrating the island on the home page.
- **Multi-year:** do we want a year toggle in v1, or pin to 2026? Existing `2025-*` JSON makes this cheap if scope allows.

## Risks

- **Label collisions** with ~30 department nodes — mitigate with the small-dept grouping, ellipsis truncation, and on-hover full labels.
- **d3-sankey layout instability** when totals on the two sides differ slightly due to rounding — mitigate by computing the trunk node as the exact sum of inflows.
- **Mobile experience** — Sankeys are notoriously bad on narrow screens. Plan a graceful fallback rather than forcing the diagram.
- **Bundle size** — d3-sankey is small (~10KB), but verify by checking the production build output before/after.
- **Visual consistency** — adding a new chart style risks looking off-brand. Lock down colors against existing components before merging.
