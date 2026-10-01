# Add the 2027 proposed budgets and make them the site headline

**Date:** 2026-10-01
**Status:** in-progress

## Goal

Extract the 2027 proposed operating budget and the 2027 preliminary capital budget. Then make 2027-proposed the website's headline year, labelled as proposed, with 2026 kept as the comparison year. See `docs/decisions/2026-10-01-2027-proposed-variant-headline.md`.

## Current State

- Sources (published 2026-09-30): the operating proposal has 179 pages (2026 adopted had 368). It covers American Rescue Plan, Five-Year Forecast, Revenue, Expenditures, 29 departments/bureaus, Salary Tables, Debt Service and Pension Funding, and leaves out Authorizing Legislation and the Budget Guide. The capital budget has 187 pages and the same layout as 2026: a 25-page introduction, then two-page project spreads grouped by six functional areas, then Appendices A–D (A–C plus a new D: Parks Tax).
- `sections-*.json` files are written by hand from the TOC and page inspection. `derive_sections.py` only cross-checks them.
- The pipeline takes the year as a parameter, but capital has no variant support in `build_web_data`, `build_capital_appendices`, `extract_chart_images`, `validate_data` or structure-change detection.
- The website hardcodes 2026/2025 in about 40 files and reads year-named keys (`totalBudget2026`, `budget2025`, ...). The headline is whichever build has no prefix. 2025 data uses a `2025-` prefix.

## Proposed Approach

**Phase 1: Inputs and extraction (premium model; judgment-heavy)**
1. Write `sections-operating-proposed.json` and `sections-capital-proposed.json`, reusing 2026 titles and slugs wherever a section continues, so cross-year matching works.
2. Split both PDFs (`split_pdf.py --year 2027 --variant proposed`).
3. Run the extractor on every split PDF and inspect debug CSVs against page images. Fix extractor regressions test-first, keeping 2024–2026 green.
4. Commit the baselines under `expected/2027/{operating,capital}-proposed/`.

**Phase 2: Pipeline variant plumbing (delegate to Sonnet; tests first)**
5. Add `--capital-variant` to `build_web_data.py`, and thread a variant through `build_capital_appendices.py`, `extract_chart_images.py`, `validate_data.py`, `derive_sections.py` and structure-change detection.
6. Handle proposed column headings ("2027 Proposed" or similar instead of "2027 Budget") wherever `"{Y} Budget"` is matched.
7. Remove per-year special cases (`year == 2026` prefix checks, hardcoded 2026 PDF paths, "2026 salary tables" / "2026 Projects" matches).

**Phase 3: Web year configuration (design on premium; sweep delegated to Sonnet)**
8. Add one web config module: headline year, headline variant label ("Proposed"), prior year, and the data imports for each. Expose year-neutral accessors so components stop reading `totalBudget2026` directly.
9. Sweep pages, components and layouts to use the config. Rebuild 2026 data under a `2026-` prefix. The 2026 amendment surfaces stay, pinned to 2026 and demoted from the homepage headline.
10. Put page images in per-year folders, so 2027 and 2026 source pages can coexist.
11. Add a site-wide "Proposed budget" indicator, plus wording that year-over-year changes compare a proposal against an adopted (amended) budget.

**Phase 4: Deploy and verification**
12. Update `deploy.sh` for the 2027 headline and 2026/2025 secondary builds, and update smoke tests.
13. Run the Python tests, the regression suite and the Playwright smoke tests. Screenshot the home, operating, capital, changes and a department page on desktop and mobile.
14. Merge to main, then deploy. Both happen only with the user's go-ahead.

## Files Affected

- `input/2027/*`: new PDFs and section definitions
- `output/regression/expected/2027/**`: new baselines
- `utils/spatial_table_extractor.py`: any fixes the 2027 layouts need
- `utils/paths.py`, `scripts/build_web_data.py`, `scripts/build_capital_appendices.py`, `scripts/extract_chart_images.py`, `scripts/validate_data.py`, `scripts/derive_sections.py`, `scripts/render_page_images.py`, `utils/capital_appendices.py`: variant/year plumbing
- `web/src/**`: year config plus the year sweep
- `deploy.sh`, `web/tests/smoke.spec.ts`, `CLAUDE.md`: updated for the new headline

## Open Questions

- What exact column headings does the proposal use ("2027 Proposed" vs "2027 Budget")? This determines step 6.
- Does Appendix D (Parks Tax, new for 2027) get its own appendix tab or a plain table? It defaults to the plain extractor output unless the appendix parser handles it cheaply.
- Do sections dropped from the proposal (Authorizing Legislation, Budget Guide, and anything after Expenditures absent in 2027) appear as "removed" in structure changes? Proposals are expected to be shorter, so they should be suppressed or annotated rather than reported as cuts.

## Risks

- Proposed-vs-adopted year-over-year deltas could be read as policy changes. Mitigation: label every comparison with the variant of each side.
- The web sweep touches about 40 files. Mitigation: smoke tests plus screenshots of each major route before calling it done.
- Variant names in folder paths could break web routes that assume `{slug}` only. Mitigation: keep slugs variant-free and put the variant in config.
