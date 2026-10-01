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

**Phase 3: Web year configuration and 2026 archive (design on premium; implementation delegated to Sonnet)**

See `docs/decisions/2026-10-01-2026-budget-archive-routes.md`.

*3a. Pipeline (one agent):*
8. `build_web_data.py` writes `views/{prefix}budget-meta.json`: `{year, priorYear, operatingVariant, capitalVariant}`. In the views with year-named fields (budget-changes, personnel, personnel-by-department), add year-neutral twins (`budgetCurrent`/`budgetPrior`, `fteCurrent`/`ftePrior`, `totalBudgetCurrent`/`totalBudgetPrior`, `totalFteCurrent`/`totalFtePrior`) and keep the year-named fields.
9. Page images go to `web/public/pages/{year}/{slug}/` (adopted 2026: `pages-adopted/2026/{slug}/`). Chart crops go to `web/public/charts/{year}/{slug}/`.
10. `build_amendment_diff.py` reads the `2026-` prefixed amended bundle.
11. `deploy.sh` builds 2027-proposed unprefixed, 2026 amended plus capital as `2026-`, the transient adopted baseline, the amendment diff, appendices for both years, and 2025 as `2025-`. It renders images for 2027 and 2026.

*3b. Web (one agent, after 3a):*
12. A year registry (`web/src/lib/budget-year.ts`) imports each year's bundles and meta and exposes the headline year, the archive years, and labels ("2027 Proposed", "2026 Budget (as amended)"). Components read the year-neutral fields and labels from it; there are no hardcoded years in headline code.
13. The budget-content pages (operating index, sections/[slug], departments index and [slug], capital index and [slug], changes, personnel) become year-parameterized components. Thin route files render them at `/...` (headline) and `/2026/...` (archive).
14. Amendment cell highlights and the adopted toggle appear only for 2026. Stories, `/amendments` and `/cross-year` read 2026 data and link to `/2026/...`.
15. A site-wide notice on headline pages says this is the Mayor's proposed budget, pending Council adoption. Archive pages get a "you're viewing the 2026 budget" notice with a link to the current year. Year-over-year wording says a 2027 proposal is being compared with the 2026 budget.

**Phase 4: Deploy and verification**
12. Update `deploy.sh` for the 2027 headline and 2026/2025 secondary builds, and update smoke tests.
13. Run the Python tests, the regression suite and the Playwright smoke tests. Screenshot the home, operating, capital, changes and a department page on desktop and mobile.
14. Merge to main, then deploy. Both happen only with the user's go-ahead.

## Progress

- Phase 1: sections written and both PDFs split and extracted. Two extractor fixes landed: header boundaries inside data now snap to narrow gaps, and bridged total-row tokens are split. 2025/2026 baselines were updated and pass. The 2027 baselines wait for the user's review.
- Phase 2: variant plumbing landed. A scratch 2027 build reconciles: 27 operating departments total $728,388,494, against $728,388,498 in the summary table. The gap is ±$1 rounding in ten department pages of the source. Capital totals $145,264,797.
- Known 2027 source quirks: the PDF labels the Parks Tax revenue table "2025/2026 Budget". Stop the Violence shows — for 2027 because the proposal ends the annual General Fund transfer and moves its 63 positions to Public Safety (PublicSource, 2026-09-30), so the site should explain it rather than show a bare zero. Public Safety Administration's 54 - Property Services subtotal is $750 more than its line items in the PDF.
- Spot checks (no paid API): every number in the 106 sections' tables appears in its PDF; all 49 funded capital projects' deliverables sum to their 2027 totals; the 26 operating subclass blocks reconcile apart from source-PDF gaps. The Revenue Summary CAGR merge is fixed (propagation now continues past narrower subtotal rows). The generic Appendix B scoring CSVs merge some wrapped project rows; the site uses the dedicated appendix parser instead.

## Files Affected

- `input/2027/*`: new PDFs and section definitions
- `output/regression/expected/2027/**`: new baselines
- `utils/spatial_table_extractor.py`: any fixes the 2027 layouts need
- `utils/paths.py`, `scripts/build_web_data.py`, `scripts/build_capital_appendices.py`, `scripts/extract_chart_images.py`, `scripts/validate_data.py`, `scripts/derive_sections.py`, `scripts/render_page_images.py`, `utils/capital_appendices.py`: variant/year plumbing
- `web/src/**`: year config plus the year sweep
- `deploy.sh`, `web/tests/smoke.spec.ts`, `CLAUDE.md`: updated for the new headline

## Open Questions

- ~~What column headings does the proposal use?~~ Resolved: it uses "2027 Budget", the same as adopted budgets, so step 6 needs no heading changes.
- Does Appendix D (Parks Tax, new for 2027) get its own appendix tab or a plain table? It defaults to the plain extractor output unless the appendix parser handles it cheaply.
- Do sections dropped from the proposal (Authorizing Legislation, Budget Guide, and anything after Expenditures absent in 2027) appear as "removed" in structure changes? Proposals are expected to be shorter, so they should be suppressed or annotated rather than reported as cuts.

## Risks

- Proposed-vs-adopted year-over-year deltas could be read as policy changes. Mitigation: label every comparison with the variant of each side.
- The web sweep touches about 40 files. Mitigation: smoke tests plus screenshots of each major route before calling it done.
- Variant names in folder paths could break web routes that assume `{slug}` only. Mitigation: keep slugs variant-free and put the variant in config.
