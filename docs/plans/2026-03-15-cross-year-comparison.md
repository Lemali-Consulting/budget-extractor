# Cross-Year Budget Comparison Page

**Date:** 2026-03-15
**Status:** in-progress

## Goal

Add a page that compares the 2025 proposed budget to what the 2026 document reports for 2025, showing where council changed the mayor's original proposal.

## Current State

- Site is built for 2026 as the primary year
- `build_web_data.py` supports `--year` parameter
- Data files are written to fixed paths (`data/budget-data.json`, etc.)
- No mechanism to have multiple years' data available simultaneously

## Proposed Approach

1. **Build 2025 data to year-prefixed files**
   - Add `--output-prefix` to `build_web_data.py` so 2025 data goes to `data/2025-budget-data.json`, `data/views/2025-*.json`
   - Keep 2026 as the default (no prefix) for backward compat with existing pages

2. **Build both years during deploy**
   - Run `build_web_data.py --year 2026` (default, writes to standard paths)
   - Run `build_web_data.py --year 2025 --output-prefix 2025` (writes to prefixed paths)

3. **Create cross-year comparison page** (`/cross-year/`)
   - Import both years' department-budgets and personnel data
   - Show: for each department, 2025-proposed budget vs 2026-doc's "2025 Budget" column
   - Highlight discrepancies (proposed vs adopted)
   - Show overall totals comparison

## Files Affected

- `scripts/build_web_data.py` — add `--output-prefix` option
- `web/src/pages/cross-year.astro` — new comparison page
- `web/src/components/CrossYearTable.tsx` — new comparison component
- CLAUDE.md deploy command — run build_web_data twice

## Open Questions

- How to present the comparison: table view, chart, or both?

## Risks

- JSON key names are year-specific (e.g., `budget2025`, `budget2024`), so the comparison component needs to handle different key patterns per year
