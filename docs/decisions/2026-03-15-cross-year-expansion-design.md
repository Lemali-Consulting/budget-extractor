# Cross-Year Comparison Expansion: UI, Matching, and Scope

**Date:** 2026-03-15
**Status:** accepted

## Context

The `/cross-year/` page currently shows department-level budget totals only. We're expanding it to include personnel and capital project comparisons. Three design decisions needed to be made: how to structure the UI, how to handle position title reclassifications, and how deep to go on capital project comparison.

## Decision

### 1. Tabs on one page (not separate pages)

Use a tabbed interface on the existing `/cross-year/` page with three tabs: Budget, Personnel, Capital. Use URL hash (`#budget`, `#personnel`, `#capital`) for persistence. Use `client:visible` for non-default tabs to reduce initial JS.

### 2. Normalize position titles, don't fuzzy-match

Before matching positions across documents, strip trailing `*`, trim whitespace, and lowercase for comparison. Filter out $0-budget positions from the add/drop lists to remove noise from pure reclassifications. Do not use Levenshtein or other fuzzy matching.

### 3. Capital comparison: project-level add/drop only

Show which projects were added, dropped, or likely consolidated between proposed and adopted. Note known consolidations (e.g., two McArdle bridge entries merged into one). Do not attempt funding-source-level comparison across documents due to differing year ranges.

## Alternatives Considered

- **Separate pages** (`/cross-year/personnel/`, etc.): Lighter per-page JS, but fragments the "what did council change?" narrative. The whole point is one coherent story.
- **Accordion sections**: Everything on one scroll, but gets very long with 900+ personnel records.
- **Fuzzy matching on position titles**: Would catch real renames but adds complexity and risk of false matches. The $0-budget filter handles most noise naturally.
- **Full capital funding source breakdown**: Rich but the data has different year ranges across documents (2024-2030 vs 2025-2031), making comparison unreliable for modest payoff.

## Consequences

- The page will load more data (personnel JSON is ~900 records per year), but lazy-loading non-default tabs and department filtering mitigates this.
- Some genuine position renames will appear as separate add/drop entries rather than matched pairs. This is acceptable — exact counts matter less than the overall picture.
- Capital comparison will be lightweight (metadata only, no dollar amounts). Can be enhanced later if funding source comparison proves valuable.
