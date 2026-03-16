# Explorer Page UI Audit

**Date:** 2026-03-15
**Purpose:** Document the current state of the Data Explorer page before a planned redesign to reduce complexity and improve usability.

## Component Inventory

| File | Lines | Role | Status |
|------|-------|------|--------|
| `web/src/pages/explorer.astro` | 13 | Route — loads data, renders `DataExplorer` with `client:load` | Active |
| `web/src/components/DataExplorer.tsx` | 698 | Main component — sidebar, tabs, data table, chart, compare | Active, monolithic |
| `web/src/components/TrendChart.tsx` | 148 | Line/area chart across year columns | Active |
| `web/src/components/YearChangeChart.tsx` | 132 | Diverging bar chart of year-over-year deltas | Active |
| `web/src/components/FundingStackedBar.tsx` | 91 | Stacked bar of CIP funding sources by year | Active |
| `web/src/components/PageImage.tsx` | 62 | Lightbox viewer for source PDF page | Active, shared |
| **Total** | **1,131** | | |

## Supporting Libraries

| File | Lines | Purpose |
|------|-------|---------|
| `web/src/lib/currency.ts` | 17 | `parseCurrency` / `formatDollar` — shared across charts |
| `web/src/lib/chart-colors.ts` | 16 | Color constants for Observable Plot |
| `web/src/lib/type-colors.ts` | 73 | 17 table-type badge colors, labels, descriptions |
| `web/src/lib/hooks.ts` | 21 | `useContainerWidth` ResizeObserver hook |

## Data Profile

| Data Source | File Size | Notes |
|-------------|-----------|-------|
| `budget-data.json` (operating) | 1.6 MB | Full table data for 293 tables |
| `capital-budget-data.json` (capital) | 581 KB | Full table data for 182 tables |
| `tables-index.json` | 271 KB | Metadata index for all 475 tables |
| **Total loaded on page visit** | **~2.5 MB** | All loaded eagerly via `client:load` |

### Table Type Distribution (475 total)

| Type | Count | % | Notes |
|------|-------|---|-------|
| personnel | 81 | 17% | Largest category |
| cip_funding | 62 | 13% | Only type that shows Funding tab |
| deliverables | 55 | 12% | Text-heavy, rarely charted |
| capital_project | 47 | 10% | |
| fund_balance | 38 | 8% | |
| financial_summary | 31 | 7% | |
| forecast | 30 | 6% | |
| revenue | 25 | 5% | |
| financial | 21 | 4% | |
| capital_summary | 19 | 4% | |
| unknown | 15 | 3% | Unclassified tables |
| fee_schedule | 15 | 3% | |
| grant | 10 | 2% | |
| debt_service | 9 | 2% | |
| allocation | 8 | 2% | |
| salary | 8 | 2% | |
| glossary | 1 | <1% | |

Budget type split: 293 operating (62%) / 182 capital (38%).

## State Complexity

`DataExplorer` manages **10 state variables**:

| State | Type | Purpose |
|-------|------|---------|
| `selectedId` | `string \| null` | Currently viewed table |
| `compareId` | `string \| null` | Comparison table |
| `tab` | `Tab` (6 values) | Active tab |
| `search` | `string` | Sidebar search query |
| `typeFilter` | `string` | Active table-type filter |
| `budgetFilter` | `'' \| 'operating' \| 'capital'` | Budget type filter |
| `chartCol` | `number` | Selected numeric column for bar chart |
| `expandedSections` | `Set<string>` | Which sidebar sections are open |
| `sidebarOpen` | `boolean` | Mobile sidebar visibility |

Plus 5 `useMemo` derivations (`tableData`, `filtered`, `grouped`, `budgetCounts`, `typeCounts`) and 5 `useEffect` hooks (hash sync ×2, chart column reset, auto-expand on search).

## UX Issues

### 1. Sidebar Information Overload
The sidebar packs three filter layers into ~320px width:
- **Search box** — fine on its own
- **3-way budget toggle** (All / Operating / Capital) — each button shows a count
- **Up to 17 type filter chips** — wrapping across 3-4 rows when all types visible

After these controls, the actual table list (expandable accordion sections) may be partially below the fold. Users must scroll past filters to browse.

### 2. Tab Proliferation
Up to 6 tabs appear, with conditional visibility:
- **Always shown:** Data, Chart, Compare
- **CIP tables only:** Funding (62 of 475 tables)
- **3+ year columns:** Trend
- **2+ year columns:** Changes

"Chart" (bar chart of one column), "Trend" (line chart across years), and "Changes" (diverging bar of deltas) are all visualizations — the distinction between them requires understanding the data shape.

### 3. Compare Tab Friction
- Compare is a **tab**, not a workflow. Selecting it replaces the current view.
- The comparison target is chosen via a `<select>` dropdown filtered to same-type tables — this can have 80+ options (e.g., personnel) with no search.
- No way to browse to the comparison target; you must know which table you want.

### 4. Empty State Offers No Guidance
First-time visitors see "Browse 475 tables" with no curated starting points. The sidebar shows collapsed sections requiring clicks to explore. There's no indication of which tables are most interesting or useful.

### 5. Eager Data Loading
All 2.5 MB of JSON is loaded on page visit via `client:load`, even if the user never selects a table. Observable Plot (~200 KB) is also bundled eagerly even though most users will start on the Data tab.

### 6. Monolithic Component
All sidebar rendering, filtering logic, data display, chart rendering coordination, compare logic, and URL sync live in a single 698-line component. Render functions (`renderSidebar`, `renderDataTab`, `renderCompareTab`) are defined inline, sharing closure over 10+ state variables.

## What Works Well

- **Type badges** with color-coding provide clear visual categorization
- **URL hash sync** makes tables bookmarkable/shareable
- **Conditional tabs** (showing only relevant viz options) is the right idea
- **CSV download** is useful and well-implemented
- **Section accordion** grouping is a good organizational pattern
- **Mobile responsive** sidebar with overlay is functional
- **Auto-expand on search** is a nice touch

## Decisions Needed

1. Should Chart/Trend/Changes merge into a single "Visualize" tab, or should we reduce to just the two most useful views?
2. Should Compare become a side-by-side workflow (pin + browse) or remain a tab with improved table selection?
3. Should we lazy-load Observable Plot, or is the bundle size acceptable?
4. Should the sidebar filters use progressive disclosure (e.g., type chips hidden behind a "More filters" toggle)?

## Recommendations

1. **Consolidate visualization tabs** — merge Chart/Trend/Changes into one tab with a viz-type selector
2. **Simplify sidebar** — make Operating/Capital a persistent top-level toggle; collapse type chips behind progressive disclosure
3. **Add curated empty state** — show 3-5 suggested starting tables (Revenue Summary, top department, a capital project)
4. **Extract sub-components** — Sidebar, TabBar, DataTab, VizTab, CompareTab as separate files
5. **Improve Compare UX** — replace dropdown with a searchable picker or pin-and-browse workflow
6. **Lazy-load chart libraries** — dynamic import Observable Plot only when viz tab is activated
