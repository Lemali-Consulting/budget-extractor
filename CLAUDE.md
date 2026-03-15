# Budget Extractor

Extracts tabular data from City of Pittsburgh budget PDFs (operating and capital) into structured CSVs, then powers an Astro-based web explorer for browsing department budgets, revenue, expenditures, and capital projects. Currently processes the 2026 budget, with multi-year support in progress.

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
- **`docs/notes/`** — Research, observations, explorations.

Conventions:
- Files are named `YYYY-MM-DD-short-kebab-description.md`
- Each document includes a date and status in its header
- Plans should be updated as work progresses (especially the status field)
- Root-level docs (`README.md`, `CLAUDE.md`) are for quick-reference project info; detailed analysis goes in `docs/`

When a decision is made, a plan is formed, or an audit is needed, proactively use the corresponding `/decision`, `/plan`, or `/audit` skill without waiting for the user to invoke it. If the conversation produces a concrete choice between alternatives, record it as a decision. If it produces a design for upcoming work, record it as a plan.

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

# Web Smoke Tests

Run `cd web && npm test` to run Playwright smoke tests against the built static site.

- Tests build the site and serve it via `astro preview`, then verify all major routes render correctly
- Covers: home, operating index + detail, capital index + detail, charts, explorer, personnel, changes, compare, glossary, about
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

# Netlify Deployment

The web app is deployed as a static site to Netlify via manual CLI deploy (not git-linked, since the repo is private).

- **Site URL**: https://pgh-budget-explorer.netlify.app
- **Site ID**: `11c41143-d0e2-4a28-9dde-10e173bf230f`
- **Auth token**: stored in `.env` as `NETLIFY_AUTH_TOKEN`

**Deploy alongside every git push** by running:
```bash
# Regenerate images (WebP) from source PDFs, then build and deploy
python3 scripts/render_page_images.py && python3 scripts/extract_chart_images.py && cd web && npm test && npm run build && source ../.env && export NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID=11c41143-d0e2-4a28-9dde-10e173bf230f && npx netlify deploy --dir=dist --prod
```
