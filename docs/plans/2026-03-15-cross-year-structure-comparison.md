# Cross-Year Budget Structure Comparison

**Date:** 2026-03-15
**Status:** draft

## Goal

Surface structural changes between budget years — sections added, removed, renamed, or reorganized — alongside staffing and spending deltas for those changes. This tells the story of *what the city chose to fund or defund*, not just how much.

## Decisions

- **Capital projects handled separately** from operating structure changes. Capital project churn is routine infrastructure lifecycle (projects complete, new ones start). Mixing "Charles Anderson Bridge completed" with "the city eliminated its equity office" dilutes the editorial impact. Capital project adds/removes will get their own treatment elsewhere.
- **Fold into the existing `/changes` ("What Changed") page** rather than creating a new page. Adds a "Departments Added & Removed" section above the existing dollar-change tables. Avoids nav bloat and puts structural changes in context alongside spending changes.
- **Model for N years internally, present pairwise in UI.** The data model stores which years each section appears in (a set per section). The UI shows a year-pair selector for pairwise comparison. When 2025 or 2023 data arrives, the timeline grows without redesign.

## Current State

The `/changes` page shows dollar and FTE changes between 2025→2026 for departments that exist in both years. It does not detect or display:
- Departments/offices that existed in one year but not another
- Sections that were renamed (e.g., "City Council as a Body" → "Office of the City Clerk")
- Positions that moved between departments due to reorganizations

The data pipeline (`build_web_data.py`) is year-aware and already supports `--year` and `--output-prefix` flags.

## Research Findings

From exploring the 2024 vs. 2026 operating budgets:

**True eliminations:**
- Office of Equity — had $778K actual in 2022, zeroed out by 2023, functions absorbed into Mayor's office, then IDEA positions eliminated by 2026
- Office of Immigrant and Refugee Affairs — folded into Mayor's office in 2023, Manager position downgraded to Coordinator and Policy Coordinator eliminated by 2026
- Wayfinders Signage Trust Fund — discontinued
- Solid Waste Trust Fund — discontinued

**Renames (same function, different name):**
- City Council as a Body → Office of the City Clerk (same cost center 101200)
- Smaller Trust Funds → Other Special Revenue Funds
- Fee Schedule → Master Fee Schedule

**New in 2026:**
- Appendices (new section)

Key insight: the PDFs often explain reorganizations explicitly — notes like "budget lines shifted into the Office of the Mayor cost center in 2023." These notes are valuable context to surface.

## Proposed Approach

### Phase 1: Data Pipeline

1. **Add `build_structure_changes()` to `build_web_data.py`**
   - Inputs: section JSON files from all available years
   - Outputs: `structure-changes.json`:
     ```json
     {
       "availableYears": [2024, 2026],
       "operatingSections": [
         {
           "title": "City Council",
           "presentInYears": [2024, 2026],
           "slugsByYear": { "2024": "city-council", "2026": "city-council" }
         },
         {
           "title": "Office of Equity",
           "presentInYears": [2024],
           "slugsByYear": { "2024": "office-of-equity" },
           "lastBudget": 778561,
           "lastFte": null,
           "mapping": { "type": "reorganization", "absorbedBy": "Office of the Mayor", "note": "Budget lines shifted into the Office of the Mayor cost center in 2023" }
         }
       ]
     }
     ```
   - For each section, record which years it appears in and its slug per year
   - For sections that disappear, attach last known budget/FTE
   - For sections that appear, attach first budget/FTE

2. **Create `input/section-mappings.json`** — manual annotations for renames and reorgs
   ```json
   [
     { "type": "rename", "from": "City Council as a Body", "to": "Office of the City Clerk" },
     { "type": "rename", "from": "Smaller Trust Funds", "to": "Other Special Revenue Funds" },
     { "type": "rename", "from": "Fee Schedule", "to": "Master Fee Schedule" },
     { "type": "reorganization", "from": "Office of Equity", "absorbedBy": "Office of the Mayor",
       "note": "Budget lines shifted into the Office of the Mayor cost center in 2023" },
     { "type": "reorganization", "from": "Office of Immigrant and Refugee Affairs", "absorbedBy": "Office of the Mayor",
       "note": "Budget lines shifted into the Office of the Mayor cost center in 2023. Manager position downgraded to Coordinator, Policy Coordinator eliminated by 2026." }
   ]
   ```
   - Small, human-maintained, captures institutional knowledge the data alone can't

### Phase 2: Integrate into `/changes` Page

3. **Add "Departments & Offices Added or Removed" section to `changes.astro`**
   - Positioned above the existing dollar-change content
   - Sub-sections:
     - **Eliminated**: cards for each removed section with last budget, FTE, and where functions moved
     - **New**: cards for each added section with first budget/FTE
     - **Renamed**: compact list of from → to pairs (less editorially interesting, but good for completeness)
   - Year-pair selector: dropdown to choose comparison years (default: earliest vs. latest)
   - All data comes from `structure-changes.json`

4. **Add Preact component `StructureChangesSection.tsx`**
   - Renders the eliminated/new/renamed sections
   - Links to section detail pages (in the appropriate year)
   - Sortable by budget impact

### Phase 3: Badges on Section Listings

5. **Add badges to `/operating/index.astro`**
   - Small pill/badge next to sections that are new or renamed
   - "New in 2026" badge, or "Formerly: City Council as a Body" subtitle
   - Data sourced from `structure-changes.json`

## Files Affected

- `scripts/build_web_data.py` — add `build_structure_changes()` function
- `input/section-mappings.json` — new file, manual rename/reorg annotations
- `web/src/data/views/structure-changes.json` — new generated view
- `web/src/pages/changes.astro` — add structure changes section
- `web/src/components/StructureChangesSection.tsx` — new Preact component
- `web/src/pages/operating/index.astro` — add badges for new/renamed sections

## Prerequisites

- 2024 budget extraction must be baselined (section JSONs created, PDFs split, extractor run, expected CSVs saved)
- `build_web_data.py` must be run for 2024 to generate the 2024 data files

## Open Questions

- **How to handle the 2025 budget?** We have 2025 data from the 2026 PDF (adopted figures) but not a standalone 2025 budget PDF. Do we need the actual 2025 PDF for structure comparison, or can we infer 2025's section list from the 2026 document's column headers?
- **Detail page year routing**: when we link to "Office of Equity (last seen 2024)", the current site only serves 2026 detail pages. Multi-year detail pages are a prerequisite for these links to work, or we simply note "present in 2024" without a deep link until multi-year routing is built.

## Risks

- **Rename detection is inherently fuzzy.** Without cost center matching, we rely on manual mappings. If a section is renamed *and* reorganized simultaneously, it may be hard to tell. Mitigation: the mapping config file makes this explicit and human-reviewed.
- **Budget numbers across years aren't directly comparable** if accounting rules changed. Mitigation: the PDFs often include explanatory notes; we surface these via the mapping annotations.
- **Scope creep**: this could grow into a full "budget history explorer." Keeping it focused on structural changes (sections present/absent) with budget context, rather than full trend analysis, keeps it manageable.
