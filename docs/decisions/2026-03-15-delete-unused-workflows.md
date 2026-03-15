# Delete Unused Extraction Workflows

**Date:** 2026-03-15
**Status:** accepted

## Context

The project has 5 dedicated extraction workflows (`extract_expenditure_tables`, `extract_revenue_tables`, `extract_financial_forecast`, `extract_grants`, `extract_special_funds`) that were built early in development. The spatial table extractor later replaced them by extracting all tables from the full budget PDF. None of their outputs are consumed by the web app or any other downstream process. With multi-year support on the horizon, carrying dead code increases the surface area for confusion and maintenance.

## Decision

Delete all 5 unused workflow directories and their corresponding output directories. Git history preserves the work if it's ever needed again.

Workflows deleted:
- `workflows/extract_expenditure_tables/`
- `workflows/extract_revenue_tables/`
- `workflows/extract_financial_forecast/`
- `workflows/extract_grants/`
- `workflows/extract_special_funds/`

Output directories deleted:
- `output/extract_expenditure_tables/`
- `output/extract_revenue_tables/`
- `output/extract_financial_forecast/`
- `output/extract_grants/`
- `output/extract_special_funds/`

## Alternatives Considered

- **Move to an `archive/` directory**: Adds clutter without benefit — git history serves the same purpose
- **Keep but mark as unused**: Creates ongoing confusion about what's active, especially as the project grows

## Consequences

- Simpler project structure with only active code
- `workflows/` directory will contain only `extract_full_pdf/`
- CLAUDE.md references to "independent extraction pipelines" should be updated
- If a future workflow needs similar logic, it can be recovered from git history
