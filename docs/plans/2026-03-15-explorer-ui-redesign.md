# Explorer UI Redesign

**Date:** 2026-03-15
**Status:** completed

## Goal

Reduce the cognitive complexity of the Data Explorer page by consolidating visualization tabs, simplifying sidebar filters, improving the compare workflow, adding a useful empty state, extracting sub-components for maintainability, and lazy-loading chart libraries for performance.

## Current State

The explorer is a single 698-line Preact component (`DataExplorer.tsx`) with 10 state variables, up to 6 tabs, a sidebar with three stacked filter layers, and 2.5 MB of eagerly-loaded JSON. See `docs/audits/2026-03-15-explorer-ui-audit.md` for the full assessment.

## Proposed Approach

Work is organized into six phases. Phases 1-3 are user-facing UX improvements. Phase 4 is structural refactoring. Phases 5-6 are polish. Each phase should result in a passing `npm test` before moving on.

### Phase 1: Extract Sub-Components

Decompose the monolith first so subsequent phases are easier to implement and review. No user-visible changes.

1. Create `web/src/components/explorer/` directory
2. Extract **`ExplorerSidebar.tsx`** — search, filters, section accordion, table list. Props: filter state + callbacks, grouped tables, selected ID.
3. Extract **`TableView.tsx`** — the data table renderer (currently `renderTable`). Props: table data, numeric cols.
4. Extract **`DataTab.tsx`** — CSV download, print button, table view. Props: table, meta.
5. Extract **`CompareTab.tsx`** — comparison picker + side-by-side tables. Props: current table, candidates, table data lookup.
6. Extract **`ChartPanel.tsx`** — move existing `ChartPanel` from inline function to its own file.
7. Slim down `DataExplorer.tsx` to ~200 lines: state management, tab routing, layout shell.
8. Move `DataExplorer.tsx` into `explorer/DataExplorer.tsx`, update import in `explorer.astro`.

### Phase 2: Consolidate Visualization Tabs

Merge Chart, Trend, Changes, and Funding into a single **"Visualize"** tab with a viz-type selector inside.

1. Create **`VizTab.tsx`** in `explorer/` — contains a `<select>` or segmented control for viz type:
   - **Bar Chart** (always available if numeric cols exist) — current ChartPanel
   - **Trend** (available if 3+ year columns) — current TrendChart
   - **Year Changes** (available if 2+ year columns) — current YearChangeChart
   - **Funding Sources** (available if table type is `cip_funding`) — current FundingStackedBar
2. Default selection: Trend if available, else Bar Chart.
3. Tab bar reduces from up to 6 tabs to exactly 3: **Data**, **Visualize**, **Compare**.
4. Remove `TAB_LABELS` entries for chart/funding/trend/changes; update `Tab` type.

### Phase 3: Simplify Sidebar Filters

Reduce filter clutter with progressive disclosure.

1. **Budget type toggle** stays at top but becomes a compact segmented control (no counts in the buttons — show count in the table list footer instead).
2. **Type filter chips** collapse behind a "Filter by type" disclosure toggle, closed by default. When a type filter is active, show a single dismissible chip above the table list.
3. **Search** stays as-is (it works well).
4. Auto-expand all sections when no search is active and there are ≤5 sections visible (reduces clicks for filtered views).

### Phase 4: Improve Compare Workflow

Replace the dropdown with a searchable table picker.

1. Add a **searchable modal/popover** for selecting comparison tables — reuse the same search + type-filter logic from the sidebar.
2. Show a "Compare with..." button that opens the picker.
3. Once selected, render side-by-side with a header showing both table names and a "Clear comparison" action.
4. Consider: highlight differing cell values (stretch goal — only if straightforward).

### Phase 5: Curated Empty State

Guide first-time visitors.

1. Replace the generic "Select a table" message with a **"Start exploring"** panel.
2. Show 4-5 suggested tables as clickable cards:
   - Revenue Summary (section 7, most relevant to general audience)
   - Expenditure Summary (section 9)
   - Bureau of Police financial summary (largest department)
   - A capital project example (e.g., Street Resurfacing)
   - Personnel overview (if a good representative exists)
3. Each card shows: section title, table type badge, row count, 1-line description from `TYPE_DESCRIPTIONS`.
4. Hard-code the suggested table IDs (derived from tables-index at build time or just known IDs).

### Phase 6: Lazy-Load Chart Libraries

Reduce initial page weight.

1. Dynamic-import `@observablehq/plot` in `VizTab.tsx` — only load when the Visualize tab is first activated.
2. Show a lightweight loading spinner/skeleton while the import resolves.
3. The three chart sub-components (`TrendChart`, `YearChangeChart`, `FundingStackedBar`) already import Plot at module level — move them to `explorer/` and have VizTab lazy-import them via `import()`.
4. Measure before/after with `npm run build` output to confirm improvement.

## Files Affected

### New files
- `web/src/components/explorer/ExplorerSidebar.tsx` — sidebar panel
- `web/src/components/explorer/TableView.tsx` — reusable table renderer
- `web/src/components/explorer/DataTab.tsx` — data tab content
- `web/src/components/explorer/CompareTab.tsx` — compare workflow
- `web/src/components/explorer/ChartPanel.tsx` — bar chart (moved from inline)
- `web/src/components/explorer/VizTab.tsx` — consolidated visualization tab
- `web/src/components/explorer/EmptyState.tsx` — curated landing view
- `web/src/components/explorer/README.md` — directory description

### Modified files
- `web/src/components/DataExplorer.tsx` → `web/src/components/explorer/DataExplorer.tsx` — slimmed to layout shell + state
- `web/src/pages/explorer.astro` — update import path
- `web/src/components/TrendChart.tsx` — move to `explorer/` (or keep shared if used elsewhere)
- `web/src/components/YearChangeChart.tsx` — move to `explorer/`
- `web/src/components/FundingStackedBar.tsx` — move to `explorer/`

### Unchanged
- `web/src/components/PageImage.tsx` — stays shared (used on section pages too)
- `web/src/lib/currency.ts`, `chart-colors.ts`, `type-colors.ts`, `hooks.ts` — no changes
- `web/src/data/` — no data format changes

## Test Strategy

- Run `cd web && npm test` (Playwright smoke tests) after each phase — explorer route must still render and be interactive
- Manual verification: select a table, switch tabs, search, filter, compare, download CSV
- Phase 6: compare `npm run build` output sizes before and after

## Open Questions

1. **Should the chart sub-components move into `explorer/` or stay shared?** Currently only used by the explorer. If other pages (e.g., section detail pages) start using them, they should stay in `components/`. Decision: move them for now; easy to extract back if needed.
2. **Compare: modal vs inline picker?** A modal is simpler to implement and avoids layout jank. Leaning modal.
3. **Empty state table IDs:** Need to pick 4-5 representative tables. Can derive from tables-index during build or hard-code known IDs.

## Risks

- **Phase 1 regression risk** — extracting sub-components could introduce prop-threading bugs. Mitigate: run tests after each extraction, not just at the end.
- **Lazy-load UX** — dynamic imports add a loading flash on first viz tab click. Mitigate: preload on hover/mousedown of the Visualize tab.
- **Compare modal complexity** — building a good searchable picker is more work than the current dropdown. Mitigate: start with a simple text input + filtered list; no need for a full combobox library.
