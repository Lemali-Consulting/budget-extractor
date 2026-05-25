# Handle the amended 2026 operating budget as a variant, amended-as-primary

**Date:** 2026-05-25
**Status:** accepted

## Context

The City of Pittsburgh published an "as amended 4-20-26" version of the 2026 operating budget PDF (Res. 217 of 2026) at the existing "2026 budget" link; the file behind it differs from our adopted (December) copy on 147 of 368 pages (general-fund appropriation $693.2M → $721.5M, plus revenue, personnel, and allocation changes). Only the operating budget was amended; the 2026 capital budget is unchanged. Our extracted data reflected the superseded adopted budget, and the team wanted to (a) ingest the amendment and (b) show adopted-vs-amended differences both at a high level and inline.

## Decision

Introduce a generic budget **variant** dimension that rides on the existing `(year, budget_type)` path scheme via `paths.variant_type()` (default `adopted`; otherwise `{budget_type}-{variant}`, e.g. `operating-amended`). The **amended** extraction becomes the canonical site data for 2026 operating; the **adopted** version is rebuilt as a transient, gitignored `adopted-*.json` baseline used only to compute diffs.

A new `scripts/build_amendment_diff.py` emits `views/2026-amendment-changes.json` (per-department + legislative, mirroring `budget-changes.json`) and `views/2026-amendment-cell-diffs.json` (sparse per-cell diffs keyed by table id → row label → column). Differences surface two ways: a high-level `/amendments` page (reusing `ChangesChart`), and inline `TableViewer` cell highlighting (amber bottom-edge accent, distinct from the green/red year-over-year axis) with a body-level floating tooltip.

## Alternatives Considered

- **Replace the adopted PDF in place (no variant)**: simplest, but loses the adopted baseline needed to compute and display diffs, and discards regression coverage of the adopted extraction.
- **Keep adopted as primary, amended as an overlay**: rejected because the amended budget is the legally current one; a public explorer should show current figures by default.
- **Site-wide adopted/amended toggle**: most flexible but the most UI/state work; deferred — amended-as-primary with a diff view covers the need.
- **Embed cell diffs directly in `budget-data.json`**: rejected to avoid bloating the large (gitignored, build-time) bundle and coupling the diff lifecycle to the main extraction; a sidecar keyed by table id is cleaner.
- **Generalize `CrossYearComparison.tsx`** for the high-level page: viable, but a static Astro table + reused `ChangesChart` was lower-risk and left the working cross-year page untouched.

## Consequences

- `split_pdf.py` / `test_regression.py` gain `--variant`; `build_web_data.py` gains `--operating-variant` / `--operating-only`; `deploy.sh` runs amended → adopted baseline → diff before the Astro build.
- Full regression baselines added under `expected/2026/operating-amended/` (306 tables); all 181 regression PDFs pass.
- Adopted-baseline bundles (`web/src/data/adopted-*.json`) are gitignored and must be regenerated before `build_amendment_diff.py` runs.
- The diff matches tables by id (signature fallback) and rows by label; structural amendment changes (e.g. added staff, reformatted salary tables) are handled, but row insertions/removals get no inline cell highlight (captured at the department/high level instead).
- Inline tooltip uses a single body-level `position:fixed` element to escape the table's `overflow`/sticky clipping.
- The pattern generalizes to future amendments and to the capital budget if it is ever amended.
