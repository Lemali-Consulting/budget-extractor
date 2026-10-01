# File 2027 as a "proposed" variant and make it the site headline

**Date:** 2026-10-01
**Status:** accepted

## Context

On 2026-09-30 the City published the 2027 operating budget proposal ("September" edition) and the 2027 preliminary capital budget. Every earlier year in the project is an adopted budget, and the plain `(year, budget_type)` slot means "adopted". The December adoption will produce a second 2027 version. Separately, the website hardcodes 2026 as its headline year in roughly 40 pages, components and layouts.

## Decision

1. **Filing:** the 2027 PDFs are stored as the `proposed` variant of each budget type, via the existing `paths.variant_type()` scheme: `input/2027/operating-proposed-budget.pdf`, `capital-proposed-budget.pdf`, `sections-{operating,capital}-proposed.json`, with baselines under `expected/2027/{operating,capital}-proposed/`. The plain 2027 slot stays reserved for the adopted budget.
2. **Headline:** the site switches its headline year to 2027, presenting the proposed budget and labelling it clearly as proposed. Hardcoded years in the web app are replaced by a single year configuration, so the December adopted 2027 can drop in without another sweep.

(Both choices were made by the user.)

## Alternatives Considered

- **Store as plain 2027:** no variant plumbing needed, but it breaks "plain means adopted" until December and forces a rename when the adopted budget arrives.
- **Extraction only (no site change):** the smallest scope, but 2027 would not be visible to readers.
- **2027 as a secondary prefixed dataset (as 2025 is):** keeps 2026 as the headline and avoids the web-wide year refactor, but leaves the newest budget off the main views.

## Consequences

- Capital needs variant support it currently lacks: `build_web_data.py` (always reads plain `capital`), `build_capital_appendices.py`, `extract_chart_images.py`, `validate_data.py`, and structure-change detection (reads only plain `sections-operating.json`).
- Year-over-year comparisons on the headline become 2027 proposed vs 2026. A proposed-vs-adopted comparison is not like-for-like, and the site must say so.
- The web app gains a single source for the headline and prior years. Hardcoded "2026"/"2025" literals and year-named JSON keys (`totalBudget2026`, etc.) are read through it.
- Page images need per-year (or per-variant) folders, because `deploy.sh` currently wipes `web/public/pages` for a single year.
- 2026 amendment surfaces (the `/amendments` page, homepage callout) remain 2026-specific and are demoted from the headline rather than deleted.
- The 2026 site data moves to a `2026-` prefix, as 2025 did when 2026 became the headline.
