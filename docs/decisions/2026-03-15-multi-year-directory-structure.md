# Multi-Year Directory Structure Decisions

**Date:** 2026-03-15
**Status:** accepted

## Context

The project is expanding from single-year (2026) to multi-year budget support. Several design questions arose during planning around directory structure, path management, and shared resources.

## Decisions

### 1. Year-first namespacing for all directories

All input, regression expected, and regression debug directories are namespaced by year at the top level.

```
input/{year}/...
output/regression/expected/{year}/{budget_type}/...
output/regression/debug/{year}/{pdf_stem}/...
```

### 2. Centralized path config via `utils/paths.py`

A shared module provides all year/budget-type path derivation. Scripts import from one place rather than each maintaining its own path constants.

**Why:** With 8+ scripts referencing these paths, duplicating the logic is error-prone. A single source of truth makes adding future years trivial.

### 3. Shared glossary (not versioned per year)

The glossary remains a single file rather than one per budget year.

**Why:** Budget terminology (subclass codes, account categories) doesn't change between years. Versioning would create identical duplicates.

## Alternatives Considered

- **Budget-type-first namespacing** (`input/operating/2026/`): Rejected because the natural unit of work is a budget year, not a budget type. You process one year's documents at a time.
- **Flat debug directory** (no year namespace): Rejected for consistency — if expected is namespaced, debug should match to avoid confusion.
- **Per-script path constants**: Rejected due to maintenance burden across 8+ scripts.
- **Per-year glossary**: Rejected as unnecessary duplication.

## Consequences

- All scripts gain a `--year` argument
- Path logic is centralized in `utils/paths.py`
- Adding a new budget year requires only: dropping PDFs in `input/{year}/`, creating section JSONs, and running the pipeline
