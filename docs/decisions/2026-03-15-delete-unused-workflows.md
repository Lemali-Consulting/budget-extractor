# Delete Unused Extraction Workflows

**Date:** 2026-03-15
**Status:** accepted

## Context

The project has 5 dedicated extraction workflows (`extract_expenditure_tables`, `extract_revenue_tables`, `extract_financial_forecast`, `extract_grants`, `extract_special_funds`) that were built early in development. The spatial table extractor later replaced them by extracting all tables from the full budget PDF. None of their outputs are consumed by the web app or any other downstream process. With multi-year support on the horizon, carrying dead code increases the surface area for confusion and maintenance.

## Decision

Delete all 6 unused workflow directories, their corresponding output directories, and the broken `main.py` entry point. Git history preserves the work if it's ever needed again.

Workflows deleted:
- `workflows/extract_expenditure_tables/`
- `workflows/extract_revenue_tables/`
- `workflows/extract_financial_forecast/`
- `workflows/extract_grants/`
- `workflows/extract_special_funds/`
- `workflows/extract_full_pdf/` — only consumer was broken `main.py`

Output directories/files deleted:
- `output/extract_expenditure_tables/`
- `output/extract_revenue_tables/`
- `output/extract_financial_forecast/`
- `output/extract_grants/`
- `output/extract_special_funds/`
- `output/extract_full_pdf/` — only a metadata reference in glossary.json
- `output/table-descriptions.json` — optional read in build_web_data.py, can be regenerated

Also deleted:
- `main.py` — broken (imports nonexistent `models` module), unreferenced

## Alternatives Considered

- **Move to an `archive/` directory**: Adds clutter without benefit — git history serves the same purpose
- **Keep but mark as unused**: Creates ongoing confusion about what's active, especially as the project grows

## Consequences

- Simpler project structure with only active code
- `workflows/` directory is now empty (contains only `__init__.py`); can be removed if no new workflows are planned
- If a future workflow needs similar logic, it can be recovered from git history
