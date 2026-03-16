# Cross-Year Structure Comparison: Design Decisions

**Date:** 2026-03-15
**Status:** accepted

## Context

Adding 2024 budget data revealed that several departments/offices were eliminated, reorganized, or renamed between budget years (e.g., Office of Equity, Office of Immigrant and Refugee Affairs). The existing `/changes` page only shows dollar and FTE changes for departments present in both years. We needed to decide how to surface these structural changes: where to put them, whether to mix operating and capital, and how to model the data for future years.

## Decision

Three decisions were made:

1. **Capital project changes are handled separately from operating structure changes.** Capital project churn (projects completing, new ones starting) is routine infrastructure lifecycle. A bridge project disappearing means it was built, not defunded. Mixing these with "the city eliminated its equity office" dilutes the editorial signal. Capital project adds/removes will get their own treatment elsewhere.

2. **Operating structure changes fold into the existing `/changes` ("What Changed") page** as a new section above the existing dollar-change tables, rather than creating a new standalone page. This puts structural changes in context alongside spending changes and avoids adding another nav item.

3. **The data model stores N years internally but the UI presents pairwise comparisons.** Each section records which years it appears in (a set). The UI shows a year-pair selector defaulting to earliest vs. latest. When more years are added, the data grows without redesign.

## Alternatives Considered

- **Mixed capital + operating on one page**: Rejected because capital project lifecycle (start/complete) has different semantics than department elimination/creation. Combining them would require constant caveats and bury the more editorially significant operating changes.
- **Standalone `/structure-changes` page**: Rejected because it fragments the "what changed" narrative. Users would need to visit two pages to understand year-over-year changes. The existing `/changes` page is the natural home.
- **Pairwise-only data model**: Rejected because it would require restructuring when a third year is added. The cost of modeling N years from the start is minimal (a set of years per section vs. a boolean).

## Consequences

- The `/changes` page grows in scope — it becomes the single place for all year-over-year operating budget changes (structural + dollar + FTE)
- A manual `input/section-mappings.json` file is needed to annotate renames vs. true eliminations, since the data alone can't always distinguish them
- Capital project lifecycle comparison is deferred to separate future work
- Multi-year detail page routing (linking to "Office of Equity in 2024") is a dependency that may need to be solved before deep links work
