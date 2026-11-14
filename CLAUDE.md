# Budget Extractor

Extracts tabular data from City of Pittsburgh budget PDFs (operating and capital) into structured CSVs, then powers an Astro-based web explorer for browsing department budgets, revenue, expenditures, and capital projects. The site publishes the **2027 proposed** budget only, plus a long-run trends page spanning the 2024–2027 documents. The 2026 (operating as amended) and 2025 archive machinery and committed data stay in the repo but are not published — see `docs/decisions/2026-11-12-publish-2027-only.md`.

The public site is held to **45 pages** (Public Source's limit is 50, so each page can be fact-checked): 11 single pages (the compare page included; the data explorer was culled, see `docs/decisions/2026-11-14-cull-the-data-explorer.md`), one merged page per department at `/departments/{slug}/` (summary on top, the PDF section below; PDF sections 9–36), and 6 citywide sections at `/sections/{slug}/` (Grants, section 58, included). Capital projects, trust funds and the other reference sections have no page of their own. `web/src/lib/published-pages.ts` says what is published and gives every link its target (none → plain text); `web/tests/published-pages.spec.ts` lists the 45 and crawls them for links to anything else. Adding a page means adding it to both on purpose. See `docs/decisions/2026-11-12-pare-site-to-43-pages.md`.

Key components:
- **Spatial table extractor** (`utils/spatial_table_extractor.py`) — core PDF-to-CSV engine using pdfplumber word positions
- **Path config** (`utils/paths.py`) — centralized year-aware path logic; all scripts import from here
- **Scripts** (`scripts/`) — utilities for splitting PDFs, regression testing, building web data, extracting chart images, LLM-based content judging, and rendering page images
- **Web app** (`web/`) — Astro + Preact + Tailwind static site deployed to Netlify; visualizes extracted budget data with Observable Plot charts
- **Regression suite** — expected CSV baselines for 111 PDFs (47 operating + 64 capital) to catch extractor regressions

# Project Structure

- `input/{year}/` — raw PDF files and section definitions, namespaced by budget year
  - `operating-budget.pdf` and `capital-budget.pdf` — source PDFs
  - `sections-operating.json` and `sections-capital.json` — section boundaries
  - `split-pdf/{operating,capital}/` — per-section PDFs (gitignored, regenerate with `scripts/split_pdf.py --year YYYY`)
- `output/` — extracted data
  - `output/regression/expected/{year}/{operating,capital}/` — test baselines
  - `output/regression/debug/{year}/` — debug output (gitignored)
  - `output/glossary/` — shared budget glossary JSON
- `scripts/` — standalone utilities (all support `--year` flag, default 2026)
- `utils/` — shared utilities including `paths.py` (centralized path config) and `spatial_table_extractor.py`
- `web/` — Astro + Preact static site (budget explorer)
- `docs/` — project documentation (see below)



# Documentation

All project documentation lives in `docs/`, organized by type:

- **`docs/decisions/`** — Decision records (ADR-lite): what was chosen and why. Use `/decision` to create.
- **`docs/plans/`** — Forward-looking implementation plans. Use `/plan` to create.
- **`docs/audits/`** — State-of-the-world snapshots before major changes. Use `/audit` to create.
- **`docs/notes/`** — Research, observations, explorations. When the issue a note records is fixed and verified, mark it `fixed` and move it to `docs/notes/archive/` in the same change.

Conventions:
- Files are named `YYYY-MM-DD-short-kebab-description.md`
- Each document includes a date and status in its header
- Plans should be updated as work progresses (especially the status field)
- Root-level docs (`README.md`, `CLAUDE.md`) are for quick-reference project info; detailed analysis goes in `docs/`

When a decision is made, a plan is formed, or an audit is needed, proactively use the corresponding `/decision`, `/plan`, or `/audit` skill without waiting for the user to invoke it. If the conversation produces a concrete choice between alternatives, record it as a decision. If it produces a design for upcoming work, record it as a plan.

# Workflow

- **Use `uv run` (not `python3`) to run all Python scripts** — the project manages dependencies via uv and scripts will fail with `ModuleNotFoundError` without it
- Commit after each meaningful unit of work — don't let changes accumulate across sessions

# Coding Guidance

- In every subdirectory, create a small README.md file 2-3 sentences long that describes the content of the directory
- At the top of every Python file, add a docstring 1-2 sentences long that describes the purpose of the file
- Ensure that type hinting is used for all parameters, return values, and variables
- For CSV outputs with non-obvious columns, include a `DATA_DICTIONARY.md` describing column names, types, and valid values

# Spatial Table Extractor

The core utility is `utils/spatial_table_extractor.py`. It extracts borderless, whitespace-separated tables from Pittsburgh budget PDFs using pdfplumber word positions.

Key concepts:
- Words are clustered into rows by y-position, then columns are detected by finding consistent inter-word gaps across rows
- Dollar signs (`$`) and their whitespace placeholders mark column boundaries; these are detected before being stripped
- Sub-tables are split by horizontal rules, colored bands, and large vertical gaps
- Multi-line headers (e.g., "2025" / "Budget") are detected and merged into the following data table
- Column structure propagates from header-bearing tables to subsequent headerless tables with similar x-extent
- Page-level headers ("City of Pittsburgh...", "Fiscal Year 2026") are filtered before table detection
- False positives (prose blocks, single-cell tables) are filtered by column count and multi-column utilization ratio

# Regression Tests

Run `python3 scripts/test_regression.py` to verify extractor output against expected CSVs.

- Expected outputs live in `output/regression/expected/{year}/{budget_type}/{pdf_stem}/P{page}T{table}.csv`
- Debug outputs (regenerated during development) go to `output/regression/debug/{year}/{pdf_stem}/`
- To regenerate debug output for a PDF: `SpatialTableExtractor().render_debug('path/to/pdf', 'output/regression/debug/{year}')`
- After visually confirming debug CSVs are correct, copy them to `output/regression/expected/{year}/{budget_type}/` and re-run the regression test
- Test a specific year: `python3 scripts/test_regression.py --year 2026`
- Always run regression tests after modifying the extractor to catch regressions across all PDFs

# Budget Variants & Amendments

A budget can have multiple **variants** for the same `(year, budget_type)` — e.g. the December "adopted" budget and a later "as amended" reissue. Variants ride on the existing path scheme via `paths.variant_type(budget_type, variant)` (default `adopted` → plain `budget_type`; otherwise `{budget_type}-{variant}`, e.g. `operating-amended`).

- Inputs: `input/{year}/{budget_type}-{variant}-budget.pdf` + `sections-{budget_type}-{variant}.json`; baselines under `expected/{year}/{budget_type}-{variant}/`.
- `split_pdf.py` and `render_page_images.py` take `--variant`; `test_regression.py` has no variant flag — it walks every `expected/{year}/{subtype}/` directory. `build_web_data.py` takes `--operating-variant`/`--capital-variant` (`adopted`, `amended`, `proposed`), `--output-prefix` and `--operating-only`.
- **2027** is filed as the `proposed` variant (`operating-proposed`, `capital-proposed`) and is the **headline**: its bundle and views are unprefixed. The inputs are the November 9 Mayor's budget (full document, same layout as the 2026 adopted); it replaced the September preliminary in place, with no diff kept. When a newer edition replaces an input PDF, repoint any test pinned to a page of the old one (`tests/fixtures/` holds one-page cuts of superseded layouts) and drop corrections the new edition no longer needs, since an unmatched correction fails the build. The 2026 archive uses the `2026-` prefix, 2025 uses `2025-`. Years are registered in `web/src/lib/budget-year.ts` (`HEADLINE`, `ARCHIVE_YEARS`); archive routes under `src/pages/[year]/` are thin wrappers around `src/components/pages/`. `ARCHIVE_YEARS` is empty, so no `/2026/...` pages are built; adding a year back republishes its archive (and needs its `deploy.sh` steps restored).
- **2026 operating** (not published; see above) is filed as **amended** ("as amended 4-20-26"). The amended extraction is the canonical site data; the adopted version is rebuilt as a transient `adopted-*.json` baseline (gitignored) only to compute diffs.
- `scripts/build_amendment_diff.py` reads the amended + adopted bundles and writes `views/2026-amendment-changes.json` (high-level) and `views/2026-amendment-cell-diffs.json` (per-cell, consumed by `TableViewer` for inline highlighting). The `/amendments` page that surfaced it was removed with the archive.
- **Source-page images come in two versions.** Canonical (amended) images render to `web/public/pages/{year}/{slug}/P{n}.webp` (chart crops likewise under `charts/{year}/`); adopted images for *changed pages only* render to `web/public/pages-adopted/{year}/{slug}/P{n}.webp` via `render_page_images.py --variant adopted --secondary-of amended`, which also writes the `views/2026-adopted-pages.json` manifest (`{slug: [pages]}`). A page counts as "changed" when its normalized text differs between the adopted and amended split PDFs. `PageImage.tsx` reads the manifest (via `[slug].astro` → `TableViewer`) and shows an Amended/Adopted toggle in the lightbox only where an adopted image exists.
- `deploy.sh` builds 2027 proposed → `build_longitudinal.py`, validates, then renders the 2027 page images before the Astro build. The 2026/2025 build, validate and render steps were dropped when the archive stopped being published; the decision record lists them. `web/public/_redirects` sends old archive, amendments, cross-year and story links to their 2027 equivalents or home.

# Source Corrections

When a source PDF mislabels something (e.g. the September 2027 preliminary headed the Parks Tax Trust Fund's 2026/2027 columns "2025 Budget"/"2026 Budget"), record the fix in `input/{year}/corrections-{subtype}.json` rather than editing baselines or the PDF. `utils/corrections.py` applies it during `build_web_data.py` (it raises if a correction matches nothing) and writes `views/{prefix}corrections.json`; the site labels each one "Corrected by us" on the table, section page and About `#corrections`. Only headings are relabelled — never amounts — and each entry carries its evidence.

Fragments the extraction mangled beyond relabelling (a table's split-off total row, a half-sentence note) are left out by hand in `web/src/lib/omitted-content.ts`. Each entry names the fact-check row that asked for it, and an entry that matches nothing fails the build. Recurring scraps are dropped by rule instead, as each year loads (`budget-year.ts`): a department's subclass pie chart title and labels, and a heading the PDF repeats where a table continues onto the next page.

# House Style: Sentence Case

Public Source capitalizes only the first word and proper nouns in headings, chart titles, labels, buttons, nav items and page titles ("Proposed capital budget", "Bureau of Police"). This applies to names taken from the PDF too: generic section titles ("Expenditure Summary" → "Expenditure summary") are converted when each year loads in `web/src/lib/budget-year.ts` via `web/src/lib/text-case.ts`, which keeps the PDF's wording in `pdf_title`; labels the data build derives (revenue categories, highlight drivers) go through `utils/text_case.py`. Department, bureau, office and fund names, Pittsburgh Budget Explorer and General Fund keep their capitals; "five-year" is generic and hyphenated even where the PDF prints "Five Year" ("Five-year forecast", "Five-year financial forecast"; both case modules apply it). The two case modules share a proper-noun and acronym list — keep them in step. Capital project names are printed in ALL CAPS and can't be cased by rule, so each has a hand-written display name in `web/src/lib/capital-project-names.ts`; a new project needs an entry there (a smoke test fails on any ALL CAPS project name). ALL CAPS department names in capital data are shown with ordinary capitals. Headings reproduced from the PDF (table and chart titles, subheadings in its prose, the table of contents built from them) are sentence-cased as each year loads by `web/src/lib/pdf-headings.ts`, which also drops what the extractor mistook for a heading: chart axis values, pie-slice and subclass labels; notes become small print. Each section's cover page (its name over the city seal) is left out by `web/src/lib/pdf-pages.ts`. Reproduced table column headers are sentence-cased only where rendered (the section table viewer); the data and `columns.budget` ("2027 Budget") stay as printed because code matches on them. Don't pair `tracking-wide` with lowercase labels.

Dates follow AP style everywhere, the PDF's own text included: Jan., Feb., Aug., Sept., Oct., Nov. and Dec. with a day, March–July spelled out, no ordinals, no numeric dates. `web/src/lib/ap-dates.ts` rewrites every section's prose and tables (and the explorer's table index) as each year loads in `budget-year.ts`; text we write ourselves (glossary, page copy) is written that way at the source. `web/tests/published-pages.spec.ts` crawls the built pages for any other form.

# Long-run Trends

`scripts/build_longitudinal.py` reads the headline-figure tables (forecast, revenue, expenditure summaries) from every budget document's baselines and writes `views/longitudinal.json`: per-year records by source document, actuals with restatements, and `conflicts` where one document gives two different figures for the same year. The `/trends` page charts it.

# Site Search

The headline (2027) search box uses **Pagefind**, which indexes the built HTML after `astro build` (`npm run build` runs both). Only the 2027 department and citywide section pages and the glossary opt in via `data-pagefind-body`; page chrome inside them is marked `data-pagefind-ignore`. Archive years, when published, use the older Fuse search over `views/{prefix}search-index.json`, which only sees titles, headers and the opening words of prose. Search does not work under `astro dev` — there is no index until a build. See `docs/decisions/2026-11-07-pagefind-full-text-search-2027.md`.

# SEO and Analytics

Every page carries a canonical link, Open Graph/Twitter tags and schema.org JSON-LD (`web/src/layouts/Base.astro`), all built from the production address in `web/src/lib/site.mjs` — change `SITE_URL` there if the site moves domain. `/sitemap.xml` and `/robots.txt` are generated from the published-page list. Public Source's Google Analytics and Parse.ly tags (`web/src/components/Analytics.astro`) are in built pages only, not `astro dev`. Every Playwright spec imports `test` from `web/tests/test-base.ts`, which answers the analytics scripts locally so test runs never count as readers; a new spec must do the same. See `docs/decisions/2026-11-13-seo-and-public-source-analytics.md`.

# Brand Colors

The site uses Public Source's 2025 brand colors. They are defined once in `web/src/lib/brand-colors.mjs`, exposed to Tailwind as `ps-*` (`ps-blue-600`, `ps-red-700`, `ps-yellow-100`, `ps-ink`, …) and imported by chart code. Use `ps-blue` / `ps-red` / `ps-yellow` rather than Tailwind's `blue` / `red` / `amber`; the scales are luminance-matched to Tailwind's, so the same step number gives the same contrast. Don't use bare PS Blue (`ps-blue`, #1277E2) for small text — it is under 4.5:1 on white; links use `ps-blue-600`. Increases are brand blue (`ps-blue`, `CHART_COLORS.positive`) and decreases brand red, never green; green is left only for a few categories (revenue, PAYGO). The brand fonts are not licensed for web text — don't add them via `@font-face`. Live text uses free lookalikes defined in `web/src/lib/brand-fonts.mjs` (Fira Sans Extra Condensed for h1/h2 and `font-display`, Alegreya Sans for body), self-hosted via Fontsource; the real faces appear only in fixed-size images like the header wordmark. See `docs/decisions/2026-11-09-public-source-brand-colors-and-logo.md`.

# Web Smoke Tests

Run `cd web && npm test` to run Playwright smoke tests against the built static site.

- Tests build the site and serve it via `astro preview`, then verify all major routes render correctly
- Covers: SEO metadata, sitemap, robots.txt and the analytics tags on every published page (`seo.spec.ts`); home, operating index, department and citywide section pages, capital index, trust fund overview, charts, compare, personnel, glossary, about, trends; that exactly the 45 published pages are built and link nowhere else; and that the retired dashboard, data explorer, 2026 archive, amendments, cross-year and story pages are not built or linked
- Checks: page titles, key content visible, navigation present, no JS console errors
- Run before deploying to Netlify to catch template, routing, or data regressions
- Requires Playwright browsers: `npx playwright install chromium` (and system deps: `npx playwright install-deps chromium`)

# Dev Container Constraints

This project runs in a devcontainer with limited memory. Follow these rules to avoid crashing it:

- **Never use `kill %1` or similar job-control kills.** Shell job numbers are unreliable across Bash tool invocations and may target the wrong process, potentially killing container-critical processes.
- **To kill a dev server, use `pkill -f`** with a specific command string (e.g., `pkill -f 'astro dev'`). This targets the right process by name.
- **Never run dev servers as background jobs** (`&`). Use `run_in_background` instead, which is managed properly.
- **Never spawn multiple dev server instances.** Always confirm the previous one is stopped before starting a new one.
- To start the web dev server: `cd web && npm run dev` (foreground, or with `run_in_background`)
- **For browser access through port forwarding, use Python's HTTP server, not `astro preview` or `astro dev`.** Both Astro servers use keep-alive/chunked connections that hang through devcontainer port forwarding. Use: `cd web && npm run build && cd dist && python3 -m http.server 8080 --bind 0.0.0.0`. After making changes, rebuild with `cd web && npm run build` and have the user refresh the browser — no live reload. (Use `npm run build`, not bare `npx astro build`: the npm script also builds the search index.)

# Netlify Deployment

The web app is deployed as a static site to Netlify via manual CLI deploy (not git-linked, since the repo is private).

- **Site URL**: https://budget.publicsource.org (the public, canonical address); the same site also answers at https://pgh-budget-explorer.netlify.app
- **Site ID**: `11c41143-d0e2-4a28-9dde-10e173bf230f`
- **Auth**: handled by the Netlify CLI's local session (`~/.config/netlify/config.json`), populated by `netlify login`. No PAT is needed in `.env`.

**Deploy alongside every git push** by running `./deploy.sh` from the project root.

# Playwright MCP Server

The Playwright MCP server is configured in `.mcp.json`. It requires `--no-sandbox` because the devcontainer doesn't allow PID namespace creation (Chrome's sandbox needs it).

**Key points:**
- The `--no-sandbox` flag in `.mcp.json` is required — without it Chrome crashes with `Operation not permitted`
- **Changes to `.mcp.json` require restarting the MCP server** via `/mcp` in Claude Code. Without a restart, old args stay in effect and Chrome will keep crashing regardless of config changes.
- If Chrome fails repeatedly with namespace errors, the fix is always: verify `--no-sandbox` is in `.mcp.json`, then restart the MCP server
- **"Browser is already in use" errors** mean a stale `SingletonLock` file exists from an unclean shutdown. Fix: `pkill -f 'chrome.*mcp'` to kill the orphaned process, then retry. The lock file is in `~/.cache/ms-playwright/mcp-chrome-*/`.
- **`file://` URLs are blocked.** The Playwright MCP server only allows `http:` and `https:`. To view local HTML files, serve them via `python3 -m http.server <port>` first.

# Mistakes

- **[testing]**: Run pytest as `uv run python3 -m pytest` — `uv run pytest` fails to resolve project deps (`ModuleNotFoundError: pdfplumber`).
